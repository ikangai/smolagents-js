import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../src/sandbox.js';

let savedDocument, savedWindow;
let postedToIframe;

before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});

function installStubDOM() {
  postedToIframe = [];
  const contentWindow = {
    postMessage: (msg) => { postedToIframe.push(msg); }
  };
  globalThis.document = {
    createElement: () => {
      const iframe = { style: {}, sandbox: '', remove() {}, contentWindow };
      Object.defineProperty(iframe, 'srcdoc', { set() {}, configurable: true });
      return iframe;
    },
    body: { appendChild() {} }
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
}

test('Sandbox._onMessage: ignores messages without a valid id', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  assert.doesNotThrow(() => s._onMessage({ data: null }));
  assert.doesNotThrow(() => s._onMessage({ data: {} }));
  assert.doesNotThrow(() => s._onMessage({ data: { type: 'result' } }));
});

test('Sandbox._onMessage: tool_call dispatches to the matching toolStub and posts the result back', async () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  let observedArgs;
  s._pending[42] = {
    toolStubs: {
      add: async (args) => { observedArgs = args; return args.a + args.b; }
    },
    resolve() {}, reject() {}
  };
  s._onMessage({
    data: { id: 42, type: 'tool_call', callId: 'cb1', tool: 'add', args: { a: 2, b: 3 } }
  });
  // Wait a microtask for the promise to resolve and postMessage to fire
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(observedArgs, { a: 2, b: 3 });
  assert.equal(postedToIframe.length, 1);
  assert.equal(postedToIframe[0].type, 'tool_result');
  assert.equal(postedToIframe[0].callId, 'cb1');
  assert.equal(postedToIframe[0].result, 5);
});

test('Sandbox._onMessage: a throwing toolStub posts back an "Error: ..." result instead of crashing', async () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  s._pending[1] = {
    toolStubs: { boom: async () => { throw new Error('kaboom'); } },
    resolve() {}, reject() {}
  };
  s._onMessage({ data: { id: 1, type: 'tool_call', callId: 'cb', tool: 'boom', args: {} } });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(postedToIframe.length, 1);
  assert.equal(postedToIframe[0].type, 'tool_result');
  assert.equal(postedToIframe[0].result, 'Error: kaboom');
});

test('Sandbox._onMessage: type=result resolves the pending promise and clears the entry', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  let resolved;
  s._pending[7] = { resolve: (v) => { resolved = v; }, reject() {} };
  s._onMessage({ data: { id: 7, type: 'result', result: 'final-value' } });
  assert.equal(resolved, 'final-value');
  assert.equal(s._pending[7], undefined);
});

test('Sandbox._onMessage: type=error rejects the pending promise with the error message', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  let rejected;
  s._pending[8] = { resolve() {}, reject: (e) => { rejected = e; } };
  s._onMessage({ data: { id: 8, type: 'error', error: 'syntax err' } });
  assert.ok(rejected instanceof Error);
  assert.equal(rejected.message, 'syntax err');
  assert.equal(s._pending[8], undefined);
});

test('Sandbox._onMessage: tool_call for an unknown tool name is silently dropped', async () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  s._pending[1] = { toolStubs: {}, resolve() {}, reject() {} };
  assert.doesNotThrow(() =>
    s._onMessage({ data: { id: 1, type: 'tool_call', callId: 'cb', tool: 'ghost', args: {} } })
  );
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(postedToIframe.length, 0);
});

test('Sandbox._onMessage: tool_call after the pending entry was cleared is dropped (no crash)', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  // No _pending[5] entry
  assert.doesNotThrow(() =>
    s._onMessage({ data: { id: 5, type: 'tool_call', callId: 'cb', tool: 'x', args: {} } })
  );
});
