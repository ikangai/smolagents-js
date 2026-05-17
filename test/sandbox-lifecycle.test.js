import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../src/sandbox.js';

let savedDocument, savedWindow;
let iframeRemoved;
let listenersAdded, listenersRemoved;
let appendedChildren;

before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});

function installStubDOM() {
  iframeRemoved = 0;
  listenersAdded = [];
  listenersRemoved = [];
  appendedChildren = [];
  globalThis.document = {
    createElement: () => {
      const iframe = { style: {}, sandbox: '', remove: () => { iframeRemoved++; } };
      Object.defineProperty(iframe, 'srcdoc', { set() {}, configurable: true });
      return iframe;
    },
    body: { appendChild: (el) => { appendedChildren.push(el); } }
  };
  globalThis.window = {
    addEventListener: (type, fn) => listenersAdded.push({ type, fn }),
    removeEventListener: (type, fn) => listenersRemoved.push({ type, fn })
  };
}

test('Sandbox.destroy: no-op when never initialized', () => {
  installStubDOM();
  const s = new Sandbox();
  assert.doesNotThrow(() => s.destroy());
  assert.equal(iframeRemoved, 0);
  assert.equal(listenersRemoved.length, 0);
});

test('Sandbox.init: appends iframe to body and registers a message listener', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  assert.equal(appendedChildren.length, 1);
  assert.equal(listenersAdded.length, 1);
  assert.equal(listenersAdded[0].type, 'message');
});

test('Sandbox.init: is idempotent (second call does nothing)', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  s.init();
  assert.equal(appendedChildren.length, 1);
  assert.equal(listenersAdded.length, 1);
});

test('Sandbox.destroy: after init, removes iframe and the message listener', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  s.destroy();
  assert.equal(iframeRemoved, 1);
  assert.equal(listenersRemoved.length, 1);
  assert.equal(listenersRemoved[0].type, 'message');
  assert.equal(s._iframe, null);
});

test('Sandbox.destroy: rejects all pending promises with a "Sandbox destroyed" error', async () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  // Inject two fake pending entries
  const pending = [];
  for (const id of [1, 2]) {
    const p = new Promise((resolve, reject) => {
      s._pending[id] = { resolve, reject };
    });
    pending.push(p);
  }
  s.destroy();
  for (const p of pending) {
    await assert.rejects(() => p, /Sandbox destroyed/);
  }
  assert.deepEqual(Object.keys(s._pending), []);
});

test('Sandbox.destroy: can be called repeatedly safely', () => {
  installStubDOM();
  const s = new Sandbox();
  s.init();
  s.destroy();
  assert.doesNotThrow(() => s.destroy());
  assert.equal(iframeRemoved, 1, 'remove should only happen once');
});
