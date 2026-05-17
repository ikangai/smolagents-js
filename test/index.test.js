import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/index.js';

test('index: exports EventEmitter class', () => {
  assert.equal(typeof api.EventEmitter, 'function');
  assert.equal(typeof new api.EventEmitter().on, 'function');
});

test('index: exports Tool class', () => {
  assert.equal(typeof api.Tool, 'function');
});

test('index: exports tool() shorthand returning Tool', () => {
  assert.equal(typeof api.tool, 'function');
  const t = api.tool({
    name: 'x',
    description: 'd',
    inputs: { a: { type: 'string', description: 'a' } },
    execute: async () => ''
  });
  assert.ok(t instanceof api.Tool);
});

test('index: exports Model class with apiKey/id validation', () => {
  assert.equal(typeof api.Model, 'function');
  assert.throws(() => new api.Model({}), /Model requires apiKey and id/);
});

test('index: exports Agent base class', () => {
  assert.equal(typeof api.Agent, 'function');
});

test('index: exports ToolCallingAgent extending Agent', () => {
  assert.equal(typeof api.ToolCallingAgent, 'function');
  assert.equal(Object.getPrototypeOf(api.ToolCallingAgent), api.Agent);
});

test('index: exports CodeAgent extending Agent', () => {
  assert.equal(typeof api.CodeAgent, 'function');
  assert.equal(Object.getPrototypeOf(api.CodeAgent), api.Agent);
});

test('index: exports ManagedAgent class', () => {
  assert.equal(typeof api.ManagedAgent, 'function');
});

test('index: exposes exactly the documented public API and no extras', () => {
  const expected = new Set([
    'EventEmitter', 'Tool', 'tool', 'Model',
    'Agent', 'ToolCallingAgent', 'CodeAgent', 'ManagedAgent'
  ]);
  const actual = new Set(Object.keys(api));
  assert.deepEqual([...actual].sort(), [...expected].sort());
});
