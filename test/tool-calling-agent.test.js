import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { ManagedAgent } from '../src/managed-agent.js';
import { tool } from '../src/tool.js';

const fakeModel = { apiKey: 'k', id: 'm' };

function makeAgent(extra = {}) {
  const t = tool({
    name: 'add',
    description: 'add two numbers',
    inputs: { a: { type: 'number', description: 'a' }, b: { type: 'number', description: 'b' } },
    execute: async ({ a, b }) => String(a + b)
  });
  return new ToolCallingAgent({ model: fakeModel, tools: [t], ...extra });
}

test('ToolCallingAgent.extractAction: returns null when no tool_calls present', () => {
  const agent = makeAgent();
  assert.equal(agent.extractAction({ content: 'final answer' }), null);
  assert.equal(agent.extractAction({ tool_calls: [] }), null);
});

test('ToolCallingAgent.extractAction: parses string arguments to args object', () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    tool_calls: [{ id: 'c1', function: { name: 'add', arguments: '{"a":1,"b":2}' } }]
  });
  assert.equal(action.toolName, 'add');
  assert.deepEqual(action.args, { a: 1, b: 2 });
  assert.equal(action.callId, 'c1');
  assert.equal(action.parseError, null);
});

test('ToolCallingAgent.extractAction: accepts already-parsed object arguments', () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    tool_calls: [{ id: 'c2', function: { name: 'add', arguments: { a: 3, b: 4 } } }]
  });
  assert.deepEqual(action.args, { a: 3, b: 4 });
  assert.equal(action.parseError, null);
});

test('ToolCallingAgent.extractAction: malformed JSON stashes parseError, does NOT throw', () => {
  const agent = makeAgent();
  let action;
  assert.doesNotThrow(() => {
    action = agent.extractAction({
      tool_calls: [{ id: 'c3', function: { name: 'add', arguments: '{this is broken' } }]
    });
  });
  assert.equal(action.toolName, 'add');
  assert.equal(action.args, undefined);
  assert.ok(action.parseError instanceof Error);
});

test('ToolCallingAgent.executeAction: surfaces parseError as a clear tool-call error', async () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    tool_calls: [{ id: 'c4', function: { name: 'add', arguments: 'not json' } }]
  });
  await assert.rejects(
    () => agent.executeAction(action),
    /Invalid JSON arguments for tool "add"/
  );
});

test('ToolCallingAgent.executeAction: throws on unknown tool', async () => {
  const agent = makeAgent();
  await assert.rejects(
    () => agent.executeAction({ toolName: 'missing', args: {}, parseError: null }),
    /Unknown tool: missing/
  );
});

test('ToolCallingAgent.executeAction: returns string result verbatim', async () => {
  const agent = makeAgent();
  const result = await agent.executeAction({ toolName: 'add', args: { a: 1, b: 2 }, parseError: null });
  assert.equal(result, '3');
});

test('ToolCallingAgent.executeAction: JSON-stringifies non-string tool result', async () => {
  const t = tool({
    name: 'obj',
    description: 'returns object',
    inputs: { x: { type: 'number', description: 'x' } },
    execute: async ({ x }) => ({ doubled: x * 2 })
  });
  const agent = new ToolCallingAgent({ model: fakeModel, tools: [t] });
  const result = await agent.executeAction({ toolName: 'obj', args: { x: 5 }, parseError: null });
  assert.equal(result, '{"doubled":10}');
});

test('ToolCallingAgent.appendActionToHistory: records ONLY the executed tool_call (parallel-call fix)', () => {
  const agent = makeAgent();
  const response = {
    content: null,
    tool_calls: [
      { id: 'c5', function: { name: 'add', arguments: '{"a":1,"b":2}' } },
      { id: 'c6', function: { name: 'add', arguments: '{"a":3,"b":4}' } }
    ]
  };
  const action = agent.extractAction(response);
  agent.history = [];
  agent.appendActionToHistory(response, action, '3');
  assert.equal(agent.history.length, 2);
  assert.equal(agent.history[0].role, 'assistant');
  assert.equal(agent.history[0].tool_calls.length, 1, 'must store only the executed call');
  assert.equal(agent.history[0].tool_calls[0].id, 'c5');
  assert.equal(agent.history[1].role, 'tool');
  assert.equal(agent.history[1].tool_call_id, 'c5');
  assert.equal(agent.history[1].content, '3');
});

test('ToolCallingAgent.appendActionToHistory: normalises undefined content to null', () => {
  const agent = makeAgent();
  const response = { tool_calls: [{ id: 'c7', function: { name: 'add', arguments: '{}' } }] };
  const action = agent.extractAction(response);
  agent.history = [];
  agent.appendActionToHistory(response, action, 'x');
  assert.equal(agent.history[0].content, null);
});

test('ToolCallingAgent.buildSystemPrompt: lists managed agents exactly once (no dup with tools list)', () => {
  const sub = makeAgent();
  const ma = new ManagedAgent({ agent: sub, name: 'researcher', description: 'does research' });
  const mgr = new ToolCallingAgent({ model: fakeModel, tools: [], managedAgents: [ma] });
  const prompt = mgr.buildSystemPrompt();
  assert.equal((prompt.match(/researcher/g) || []).length, 1);
});

test('ToolCallingAgent.getToolSchemas: includes managed agents alongside regular tools', () => {
  const sub = makeAgent();
  const ma = new ManagedAgent({ agent: sub, name: 'researcher', description: 'does research' });
  const t = tool({
    name: 'search',
    description: 'web search',
    inputs: { q: { type: 'string', description: 'q' } },
    execute: async () => ''
  });
  const mgr = new ToolCallingAgent({ model: fakeModel, tools: [t], managedAgents: [ma] });
  const schemas = mgr.getToolSchemas();
  const names = schemas.map(s => s.function.name).sort();
  assert.deepEqual(names, ['researcher', 'search']);
});
