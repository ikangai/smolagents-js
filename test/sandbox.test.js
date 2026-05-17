import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Sandbox } from '../src/sandbox.js';

// Sandbox.init() touches document/window. Stub the minimum needed so the
// validation path inside execute() is reachable without a real DOM.
let savedDocument, savedWindow;

before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  globalThis.document = {
    createElement: () => {
      const iframe = { style: {}, sandbox: '' };
      Object.defineProperty(iframe, 'srcdoc', { set() {} });
      return iframe;
    },
    body: { appendChild() {} }
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {}
  };
});

after(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});

test('Sandbox: constructor stores custom timeout', () => {
  const s = new Sandbox({ timeout: 5000 });
  assert.equal(s.timeout, 5000);
});

test('Sandbox: timeout defaults to 30000ms when omitted', () => {
  const s = new Sandbox();
  assert.equal(s.timeout, 30000);
});

test('Sandbox: allowedGlobals defaults to a useful set including Math/JSON/console', () => {
  const s = new Sandbox();
  assert.ok(s.allowedGlobals.includes('Math'));
  assert.ok(s.allowedGlobals.includes('JSON'));
  assert.ok(s.allowedGlobals.includes('console'));
  assert.ok(s.allowedGlobals.includes('Promise'));
});

test('Sandbox.execute: rejects tool name with a hyphen with a clear identifier error', async () => {
  const s = new Sandbox();
  await assert.rejects(
    () => s.execute('return 1', { 'get-weather': async () => 'x' }),
    /Sandbox: tool name "get-weather" is not a valid JavaScript identifier/
  );
});

test('Sandbox.execute: rejects tool name with a quote character (template-injection vector)', async () => {
  const s = new Sandbox();
  await assert.rejects(
    () => s.execute('return 1', { "tool'); evil(); ('": async () => 'x' }),
    /not a valid JavaScript identifier/
  );
});

test('Sandbox.execute: rejects tool name starting with a digit', async () => {
  const s = new Sandbox();
  await assert.rejects(
    () => s.execute('return 1', { '1stTool': async () => 'x' }),
    /not a valid JavaScript identifier/
  );
});

test('Sandbox.execute: rejects empty-string tool name', async () => {
  const s = new Sandbox();
  await assert.rejects(
    () => s.execute('return 1', { '': async () => 'x' }),
    /not a valid JavaScript identifier/
  );
});
