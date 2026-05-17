import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Model } from '../src/model.js';

function mockFetch(impl) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  return () => { globalThis.fetch = originalFetch; };
}

test('Model: constructor throws when apiKey is missing', () => {
  assert.throws(() => new Model({ id: 'anthropic/claude' }), /Model requires apiKey and id/);
});

test('Model: constructor throws when id is missing', () => {
  assert.throws(() => new Model({ apiKey: 'sk-or-x' }), /Model requires apiKey and id/);
});

test('Model: generate posts to OpenRouter with Bearer auth and model id in body', async () => {
  let capturedUrl, capturedInit;
  const restore = mockFetch(async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] })
    };
  });
  try {
    const m = new Model({ apiKey: 'sk-test', id: 'anthropic/claude-sonnet-4-5' });
    await m.generate([{ role: 'user', content: 'hi' }]);
    assert.equal(capturedUrl, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(capturedInit.method, 'POST');
    assert.equal(capturedInit.headers['Authorization'], 'Bearer sk-test');
    assert.equal(capturedInit.headers['Content-Type'], 'application/json');
    const body = JSON.parse(capturedInit.body);
    assert.equal(body.model, 'anthropic/claude-sonnet-4-5');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
    assert.equal('tools' in body, false, 'tools field should be absent when no tools passed');
  } finally { restore(); }
});

test('Model: generate includes tools field only when tools array is non-empty', async () => {
  let body;
  const restore = mockFetch(async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'x' } }] }) };
  });
  try {
    const m = new Model({ apiKey: 'k', id: 'm' });
    const fakeSchema = { type: 'function', function: { name: 'f', description: 'd', parameters: {} } };
    await m.generate([{ role: 'user', content: 'hi' }], [fakeSchema]);
    assert.deepEqual(body.tools, [fakeSchema]);
  } finally { restore(); }
});

test('Model: generate throws with status code and body on non-OK response', async () => {
  const restore = mockFetch(async () => ({
    ok: false,
    status: 401,
    text: async () => 'invalid api key'
  }));
  try {
    const m = new Model({ apiKey: 'bad', id: 'm' });
    await assert.rejects(
      () => m.generate([{ role: 'user', content: 'hi' }]),
      /OpenRouter API error \(401\): invalid api key/
    );
  } finally { restore(); }
});

test('Model: generate throws when response is missing choices[0].message', async () => {
  const restore = mockFetch(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ error: { code: 500, message: 'oops' } })
  }));
  try {
    const m = new Model({ apiKey: 'k', id: 'm' });
    await assert.rejects(
      () => m.generate([{ role: 'user', content: 'hi' }]),
      /OpenRouter API returned unexpected response/
    );
  } finally { restore(); }
});

test('Model: generate returns the assistant message verbatim', async () => {
  const msg = { role: 'assistant', content: 'hello', tool_calls: [{ id: 't', function: { name: 'f', arguments: '{}' } }] };
  const restore = mockFetch(async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: msg }] })
  }));
  try {
    const m = new Model({ apiKey: 'k', id: 'm' });
    const result = await m.generate([{ role: 'user', content: 'hi' }]);
    assert.deepEqual(result, msg);
  } finally { restore(); }
});
