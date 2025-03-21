"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = EscalationEventDefinition;
var _getPropertyValue = _interopRequireDefault(require("../getPropertyValue.js"));
var _shared = require("../shared.js");
var _messageHelper = require("../messageHelper.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const kCompleted = Symbol.for('completed');
const kMessageQ = Symbol.for('messageQ');
const kExecuteMessage = Symbol.for('executeMessage');
const kReferenceElement = Symbol.for('referenceElement');
const kReference = Symbol.for('reference');
function EscalationEventDefinition(activity, eventDefinition) {
  const {
    id,
    broker,
    environment,
    isThrowing
  } = activity;
  const {
    type,
    behaviour = {}
  } = eventDefinition;
  this.id = id;
  this.type = type;
  const reference = this.reference = {
    name: 'anonymous',
    ...behaviour.escalationRef,
    referenceType: 'escalate'
  };
  this.isThrowing = isThrowing;
  this.activity = activity;
  this.broker = broker;
  this.logger = environment.Logger(type.toLowerCase());
  const referenceElement = this[kReferenceElement] = reference.id && activity.getActivityById(reference.id);
  if (!isThrowing) {
    this[kCompleted] = false;
    const referenceId = referenceElement ? referenceElement.id : 'anonymous';
    const messageQueueName = `${reference.referenceType}-${(0, _shared.brokerSafeId)(id)}-${(0, _shared.brokerSafeId)(referenceId)}-q`;
    this[kMessageQ] = broker.assertQueue(messageQueueName, {
      autoDelete: false,
      durable: true
    });
    broker.bindQueue(messageQueueName, 'api', `*.${reference.referenceType}.#`, {
      durable: true,
      priority: 400
    });
  }
}
Object.defineProperty(EscalationEventDefinition.prototype, 'executionId', {
  get() {
    return this[kExecuteMessage]?.content.executionId;
  }
});
EscalationEventDefinition.prototype.execute = function execute(executeMessage) {
  return this.isThrowing ? this.executeThrow(executeMessage) : this.executeCatch(executeMessage);
};
EscalationEventDefinition.prototype.executeCatch = function executeCatch(executeMessage) {
  this[kExecuteMessage] = executeMessage;
  this[kCompleted] = false;
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const info = this[kReference] = this._getReferenceInfo(executeMessage);
  const broker = this.broker;
  this[kMessageQ].consume(this._onCatchMessage.bind(this), {
    noAck: true,
    consumerTag: `_onescalate-${executionId}`
  });
  if (this[kCompleted]) return;
  broker.subscribeTmp('api', `activity.#.${executionId}`, this._onApiMessage.bind(this), {
    noAck: true,
    consumerTag: `_api-${executionId}`
  });
  this._debug(`expect ${info.description}`);
  const waitContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    parent: (0, _messageHelper.shiftParent)(parent),
    escalation: {
      ...info.message
    }
  });
  waitContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.wait', waitContent);
};
EscalationEventDefinition.prototype.executeThrow = function executeThrow(executeMessage) {
  const executeContent = executeMessage.content;
  const {
    executionId,
    parent
  } = executeContent;
  const info = this._getReferenceInfo(executeMessage);
  this.logger.debug(`<${executionId} (${this.activity.id})> escalate ${info.description}`);
  const broker = this.broker;
  const throwContent = (0, _messageHelper.cloneContent)(executeContent, {
    executionId: parent.executionId,
    message: info.message,
    state: 'throw'
  });
  throwContent.parent = (0, _messageHelper.shiftParent)(parent);
  broker.publish('event', 'activity.escalate', throwContent, {
    type: 'escalate',
    delegate: true
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent));
};
EscalationEventDefinition.prototype._onCatchMessage = function onCatchMessage(routingKey, message) {
  const info = this[kReference];
  if ((0, _getPropertyValue.default)(message, 'content.message.id') !== info.message.id) return;
  const output = message.content.message;
  this[kCompleted] = true;
  this._stop();
  this._debug(`caught ${info.description}`);
  const executeContent = this[kExecuteMessage].content;
  const {
    parent,
    ...content
  } = executeContent;
  const catchContent = (0, _messageHelper.cloneContent)(content, {
    message: {
      ...output
    },
    executionId: parent.executionId
  });
  catchContent.parent = (0, _messageHelper.shiftParent)(parent);
  const broker = this.broker;
  broker.publish('event', 'activity.catch', catchContent, {
    type: 'catch'
  });
  return broker.publish('execution', 'execute.completed', (0, _messageHelper.cloneContent)(executeContent, {
    output,
    state: 'catch'
  }));
};
EscalationEventDefinition.prototype._onApiMessage = function onApiMessage(routingKey, message) {
  switch (message.properties.type) {
    case 'escalate':
      {
        return this._onCatchMessage(routingKey, message);
      }
    case 'discard':
      {
        this[kCompleted] = true;
        this._stop();
        return this.broker.publish('execution', 'execute.discard', (0, _messageHelper.cloneContent)(this[kExecuteMessage].content));
      }
    case 'stop':
      {
        this._stop();
        break;
      }
  }
};
EscalationEventDefinition.prototype._stop = function stop() {
  const broker = this.broker,
    executionId = this.executionId;
  broker.cancel(`_api-${executionId}`);
  broker.cancel(`_onescalate-${executionId}`);
};
EscalationEventDefinition.prototype._getReferenceInfo = function getReferenceInfo(message) {
  const referenceElement = this[kReferenceElement];
  if (!referenceElement) {
    return {
      message: {
        ...this.reference
      },
      description: 'anonymous escalation'
    };
  }
  const result = {
    message: referenceElement.resolve(message)
  };
  result.description = `${result.message.name} <${result.message.id}>`;
  return result;
};
EscalationEventDefinition.prototype._debug = function debug(msg) {
  this.logger.debug(`<${this.executionId} (${this.activity.id})> ${msg}`);
};