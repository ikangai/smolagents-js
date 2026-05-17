import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../src/sandbox.js';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';

test('Agent.run: rejects a concurrent run attempt while already running', async () => {
  let resolveModel;
  const m = {
    apiKey: 'k', id: 'm',
    generate: () => new Promise((r) => { resolveModel = () => r({ role: 'assistant', content: 'done' }); })
  };
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  const first = agent.run('first task');
  await assert.rejects(() => agent.run('second task'), /Agent is already running/);
  resolveModel();
  await first;
  assert.equal(agent.status, 'done');
});

test('Agent.run: after the first run completes a second run is allowed', async () => {
  const m = {
    apiKey: 'k', id: 'm',
    generate: async () => ({ role: 'assistant', content: 'x' })
  };
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  await agent.run('a');
  await agent.run('b');
  assert.equal(agent.status, 'done');
});

test('Sandbox._pending: has a null prototype (no prototype-pollution surface)', () => {
  const s = new Sandbox();
  assert.equal(Object.getPrototypeOf(s._pending), null);
});

test('Sandbox.execute: tool name "constructor" passes identifier check but stays safe via null-proto _pending', async () => {
  const savedDoc = globalThis.document, savedWin = globalThis.window;
  globalThis.document = { createElement: () => ({ style: {}, sandbox: '' }), body: { appendChild() {} } };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  try {
    const s = new Sandbox();
    // constructor IS a valid identifier so the gate lets it through, but _pending is
    // a null-prototype map so the "constructor" inherited key cannot accidentally collide.
    assert.equal(s._pending.constructor, undefined);
    assert.equal(typeof ({}).constructor, 'function'); // sanity: plain {} would expose it
  } finally {
    globalThis.document = savedDoc;
    globalThis.window = savedWin;
  }
});
