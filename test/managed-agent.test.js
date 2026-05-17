import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManagedAgent } from '../src/managed-agent.js';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { Tool } from '../src/tool.js';

const fakeModel = { apiKey: 'k', id: 'm' };

function makeSubAgent() {
  return new ToolCallingAgent({ model: fakeModel, tools: [] });
}

test('ManagedAgent: constructor throws when agent is missing', () => {
  assert.throws(() => new ManagedAgent({ name: 'r', description: 'd' }),
    /ManagedAgent requires agent, name, and description/);
});

test('ManagedAgent: constructor throws when name is missing', () => {
  assert.throws(() => new ManagedAgent({ agent: makeSubAgent(), description: 'd' }),
    /ManagedAgent requires agent, name, and description/);
});

test('ManagedAgent: constructor throws when description is missing', () => {
  assert.throws(() => new ManagedAgent({ agent: makeSubAgent(), name: 'r' }),
    /ManagedAgent requires agent, name, and description/);
});

test('ManagedAgent: constructor stores agent, name, description', () => {
  const sub = makeSubAgent();
  const ma = new ManagedAgent({ agent: sub, name: 'researcher', description: 'web research' });
  assert.equal(ma.agent, sub);
  assert.equal(ma.name, 'researcher');
  assert.equal(ma.description, 'web research');
});

test('ManagedAgent.toTool: returns a Tool with the managed agent name + description', () => {
  const sub = makeSubAgent();
  const ma = new ManagedAgent({ agent: sub, name: 'researcher', description: 'web research' });
  const t = ma.toTool();
  assert.ok(t instanceof Tool);
  assert.equal(t.name, 'researcher');
  assert.equal(t.description, 'web research');
  assert.equal(t.outputType, 'string');
});

test('ManagedAgent.toTool: schema declares a single required "task" string input', () => {
  const sub = makeSubAgent();
  const ma = new ManagedAgent({ agent: sub, name: 'r', description: 'd' });
  const schema = ma.toTool().toOpenAISchema();
  assert.deepEqual(schema.function.parameters.required, ['task']);
  assert.equal(schema.function.parameters.properties.task.type, 'string');
});

test('ManagedAgent.toTool: execute delegates to agent.run with the task string', async () => {
  const sub = makeSubAgent();
  let received;
  sub.run = async (task) => { received = task; return 'sub-result'; };
  const ma = new ManagedAgent({ agent: sub, name: 'r', description: 'd' });
  const result = await ma.toTool().execute({ task: 'go research X' });
  assert.equal(received, 'go research X');
  assert.equal(result, 'sub-result');
});

test('ManagedAgent.toTool: execute tags sub-agent emissions with depth and restores original emit', async () => {
  const sub = makeSubAgent();
  const events = [];
  const originalEmit = sub.emit;
  sub.on('think', (data) => events.push(data));
  sub.run = async () => {
    sub.emit('think', { step: 1 });
    return 'done';
  };
  const ma = new ManagedAgent({ agent: sub, name: 'r', description: 'd' });
  await ma.toTool().execute({ task: 'x' });
  assert.equal(events.length, 1);
  assert.equal(events[0].depth, 1, 'depth should be tagged onto emitted data');
  assert.equal(events[0].step, 1, 'original data fields should be preserved');
  // After execute, emit must be restored to the original
  assert.equal(sub.emit, originalEmit);
});

test('ManagedAgent.toTool: execute restores emit even when sub-agent.run rejects', async () => {
  const sub = makeSubAgent();
  const originalEmit = sub.emit;
  sub.run = async () => { throw new Error('sub failed'); };
  const ma = new ManagedAgent({ agent: sub, name: 'r', description: 'd' });
  await assert.rejects(() => ma.toTool().execute({ task: 'x' }), /sub failed/);
  assert.equal(sub.emit, originalEmit);
});
