import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CodeAgent } from '../src/code-agent.js';
import { ManagedAgent } from '../src/managed-agent.js';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

const fakeModel = { apiKey: 'k', id: 'm' };

let savedDocument, savedWindow;
before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  globalThis.document = { createElement: () => ({ style: {}, sandbox: '' }), body: { appendChild() {} } };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
});
after(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});

test('CodeAgent.executeAction: forwards code + tool stubs to sandbox.execute and returns the result', async () => {
  const t = tool({
    name: 'search',
    description: 's',
    inputs: { q: { type: 'string', description: 'q' } },
    execute: async ({ q }) => `searched:${q}`
  });
  const agent = new CodeAgent({ model: fakeModel, tools: [t] });
  let observedCode, observedStubs;
  agent.sandbox.execute = async (code, stubs) => {
    observedCode = code;
    observedStubs = stubs;
    return 'sandbox-output';
  };
  const result = await agent.executeAction({ type: 'code', code: 'return await search({q:"x"})' });
  assert.equal(observedCode, 'return await search({q:"x"})');
  assert.deepEqual(Object.keys(observedStubs), ['search']);
  assert.equal(typeof observedStubs.search, 'function');
  // The injected stub should call the underlying tool.execute
  assert.equal(await observedStubs.search({ q: 'hi' }), 'searched:hi');
  assert.equal(result, 'sandbox-output');
});

test('CodeAgent.executeAction: JSON-stringifies non-string sandbox results', async () => {
  const agent = new CodeAgent({ model: fakeModel });
  agent.sandbox.execute = async () => ({ key: 'value', n: 42 });
  const result = await agent.executeAction({ type: 'code', code: 'return {key:"value",n:42}' });
  assert.equal(result, '{"key":"value","n":42}');
});

test('CodeAgent.executeAction: includes managed agents as callable stubs (alongside tools)', async () => {
  const sub = new ToolCallingAgent({ model: fakeModel });
  sub.run = async () => 'sub-answer';
  const ma = new ManagedAgent({ agent: sub, name: 'oracle', description: 'd' });
  const agent = new CodeAgent({ model: fakeModel, managedAgents: [ma] });
  let stubs;
  agent.sandbox.execute = async (_code, s) => { stubs = s; return ''; };
  await agent.executeAction({ type: 'code', code: 'noop' });
  assert.ok('oracle' in stubs);
  assert.equal(await stubs.oracle({ task: 'q' }), 'sub-answer');
});

test('CodeAgent.executeAction: propagates sandbox errors (e.g. identifier validation)', async () => {
  const agent = new CodeAgent({ model: fakeModel });
  agent.sandbox.execute = async () => { throw new Error('Sandbox: tool name "x-y" is not a valid JavaScript identifier'); };
  await assert.rejects(
    () => agent.executeAction({ type: 'code', code: 'noop' }),
    /not a valid JavaScript identifier/
  );
});

test('CodeAgent.destroy: delegates to sandbox.destroy', () => {
  const agent = new CodeAgent({ model: fakeModel });
  let destroyed = false;
  agent.sandbox.destroy = () => { destroyed = true; };
  agent.destroy();
  assert.equal(destroyed, true);
});

test('CodeAgent: passes executionTimeout through to the Sandbox', () => {
  const agent = new CodeAgent({ model: fakeModel, executionTimeout: 1234 });
  assert.equal(agent.sandbox.timeout, 1234);
});
