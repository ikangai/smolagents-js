import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent.js';
import { Model } from '../src/model.js';
import { ManagedAgent } from '../src/managed-agent.js';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

const fakeModel = { apiKey: 'k', id: 'm' };

class StubAgent extends Agent {
  buildSystemPrompt() { return 'stub system'; }
  extractAction() { return null; }
  async executeAction() { return ''; }
  appendActionToHistory() {}
}

test('Agent: constructor wraps a config object in a Model instance', () => {
  const a = new StubAgent({ model: fakeModel });
  assert.ok(a.model instanceof Model);
  assert.equal(a.model.id, 'm');
});

test('Agent: constructor passes an existing Model through unchanged', () => {
  const m = new Model(fakeModel);
  const a = new StubAgent({ model: m });
  assert.equal(a.model, m);
});

test('Agent: constructor keys tools by name into an object', () => {
  const t1 = tool({ name: 'a', description: 'd', inputs: { x: { type: 'string', description: 'x' } }, execute: async () => '' });
  const t2 = tool({ name: 'b', description: 'd', inputs: { x: { type: 'string', description: 'x' } }, execute: async () => '' });
  const a = new StubAgent({ model: fakeModel, tools: [t1, t2] });
  assert.equal(a.tools.a, t1);
  assert.equal(a.tools.b, t2);
});

test('Agent: constructor defaults — tools: {}, managedAgents: [], maxSteps: 10, status: idle, step: 0, history: []', () => {
  const a = new StubAgent({ model: fakeModel });
  assert.deepEqual(a.tools, {});
  assert.deepEqual(a.managedAgents, []);
  assert.equal(a.maxSteps, 10);
  assert.equal(a.status, 'idle');
  assert.equal(a.currentStep, 0);
  assert.deepEqual(a.history, []);
});

test('Agent: constructor accepts a custom maxSteps', () => {
  const a = new StubAgent({ model: fakeModel, maxSteps: 5 });
  assert.equal(a.maxSteps, 5);
});

test('Agent.getState: returns a snapshot with status, step, maxSteps and a defensive history copy', () => {
  const a = new StubAgent({ model: fakeModel, maxSteps: 7 });
  a.history.push({ role: 'user', content: 'hi' });
  const s = a.getState();
  assert.equal(s.status, 'idle');
  assert.equal(s.currentStep, 0);
  assert.equal(s.maxSteps, 7);
  assert.deepEqual(s.history, [{ role: 'user', content: 'hi' }]);
  s.history.push({ role: 'evil', content: 'mutate' });
  assert.equal(a.history.length, 1, 'snapshot mutation must not leak back into agent.history');
});

test('Agent.name: returns the constructor name', () => {
  const a = new StubAgent({ model: fakeModel });
  assert.equal(a.name, 'StubAgent');
  const tca = new ToolCallingAgent({ model: fakeModel });
  assert.equal(tca.name, 'ToolCallingAgent');
});

test('Agent._getAllTools: returns plain tools when no managed agents', () => {
  const t = tool({ name: 'a', description: 'd', inputs: { x: { type: 'string', description: 'x' } }, execute: async () => '' });
  const a = new StubAgent({ model: fakeModel, tools: [t] });
  const all = a._getAllTools();
  assert.deepEqual(Object.keys(all), ['a']);
  assert.equal(all.a, t);
});

test('Agent._getAllTools: merges managed agents into the tools map (keyed by managed agent name)', () => {
  const sub = new ToolCallingAgent({ model: fakeModel });
  const ma = new ManagedAgent({ agent: sub, name: 'researcher', description: 'd' });
  const a = new StubAgent({ model: fakeModel, managedAgents: [ma] });
  const all = a._getAllTools();
  assert.ok('researcher' in all);
  assert.equal(all.researcher.name, 'researcher');
});

test('Agent.getToolSchemas (base): returns empty array by default', () => {
  const a = new StubAgent({ model: fakeModel });
  assert.deepEqual(a.getToolSchemas(), []);
});

test('Agent: abstract methods on the base class throw "Not implemented"', () => {
  const a = new Agent({ model: fakeModel });
  assert.throws(() => a.buildSystemPrompt(), /Not implemented/);
  assert.throws(() => a.extractAction({}), /Not implemented/);
  assert.rejects(() => a.executeAction({}), /Not implemented/);
  assert.throws(() => a.appendActionToHistory({}, {}, ''), /Not implemented/);
});
