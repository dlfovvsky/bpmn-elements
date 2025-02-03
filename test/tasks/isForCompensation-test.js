import Association from '../../src/flows/Association.js';
import ServiceTask from '../../src/tasks/ServiceTask.js';
import testHelpers from '../helpers/testHelpers.js';

describe('isForCompensation task', () => {
  it('runs task when association is taken', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                args.pop()();
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    context.getInboundAssociations()[0].take();

    expect(task).to.have.property('counters').that.deep.equal({ taken: 1, discarded: 0 });
  });

  it('runs task each time association is taken', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                args.pop()();
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    const [association] = context.getInboundAssociations();
    association.take();
    association.take();

    expect(task).to.have.property('counters').that.deep.equal({ taken: 2, discarded: 0 });
  });

  it('queues taken association if task is running', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            type: 'bpmn:Association',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const serviceCalls = [];
    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                serviceCalls.push(args);
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    const [association] = context.getInboundAssociations();
    association.take();
    association.take();

    serviceCalls.shift().pop()();

    expect(task).to.have.property('counters').that.deep.equal({ taken: 1, discarded: 0 });

    serviceCalls.shift().pop()();

    expect(task).to.have.property('counters').that.deep.equal({ taken: 2, discarded: 0 });
  });

  it('multiple associations are supported', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc_1',
            parent: { id: 'Bp_1' },
            sourceId: 'comp1',
            targetId: 'service',
            Behaviour: Association,
          },
          {
            id: 'assoc_2',
            parent: { id: 'Bp_1' },
            sourceId: 'comp2',
            targetId: 'service',
            Behaviour: Association,
          },
          {
            id: 'assoc_3',
            parent: { id: 'Bp_1' },
            sourceId: 'comp3',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                args.pop()();
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    for (const association of context.getInboundAssociations()) {
      association.take();
    }

    expect(task).to.have.property('counters').that.deep.equal({ taken: 3, discarded: 0 });
  });

  it('task ignores discarded association', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                args.pop()();
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    const [association] = context.getInboundAssociations();
    association.take();
    association.discard();

    expect(task).to.have.property('counters').that.deep.equal({ taken: 1, discarded: 0 });
  });

  it('stop ignores taken association', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute() {},
            };
          },
        },
      },
      context
    );

    task.activate();
    task.stop();

    expect(task.broker.consumerCount, 'task consumers').to.equal(0);

    const [association] = context.getInboundAssociations();
    association.take();

    expect(task).to.have.property('counters').that.deep.equal({ taken: 0, discarded: 0 });
  });

  it('resumed task continues with taken associations', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const serviceCalls = [];
    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                serviceCalls.push(args);
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    const [association] = context.getInboundAssociations();
    association.take();
    association.take();

    task.stop();
    task.resume();

    expect(serviceCalls).to.have.length(2);
    expect(serviceCalls[0][0].fields.redelivered).to.not.be.ok;
    expect(serviceCalls[1][0].fields.redelivered).to.be.ok;
  });

  it('recovered task continues with taken associations', () => {
    const context = testHelpers.emptyContext({
      getInboundAssociations() {
        return [
          {
            id: 'assoc',
            parent: { id: 'Bp_1' },
            sourceId: 'comp',
            targetId: 'service',
            Behaviour: Association,
          },
        ];
      },
    });

    const serviceCalls = [];
    const task = ServiceTask(
      {
        id: 'service',
        type: 'servicetask',
        behaviour: {
          isForCompensation: true,
          Service: function Service() {
            return {
              execute(...args) {
                serviceCalls.push(args);
              },
            };
          },
        },
      },
      context
    );

    task.activate();
    const [association] = context.getInboundAssociations();
    association.take();
    association.take();

    task.stop();
    task.recover(task.getState());

    task.resume();

    expect(serviceCalls).to.have.length(2);
    expect(serviceCalls[0][0].fields.redelivered).to.not.be.ok;
    expect(serviceCalls[1][0].fields.redelivered).to.be.ok;

    serviceCalls.pop().pop()();
  });
});
