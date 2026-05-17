import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Tool, tool } from '../src/tool.js';

test('Tool: constructor stores name, description, inputs, outputType, execute', () => {
  const exec = async () => 'x';
  const t = new Tool({
    name: 'foo',
    description: 'desc',
    inputs: { a: { type: 'string', description: 'a' } },
    outputType: 'number',
    execute: exec
  });
  assert.equal(t.name, 'foo');
  assert.equal(t.description, 'desc');
  assert.deepEqual(t.inputs, { a: { type: 'string', description: 'a' } });
  assert.equal(t.outputType, 'number');
  assert.equal(t.execute, exec);
});

test('Tool: outputType defaults to "string" when omitted', () => {
  const t = new Tool({
    name: 'foo',
    description: 'd',
    inputs: { x: { type: 'string', description: 'x' } },
    execute: async () => 'y'
  });
  assert.equal(t.outputType, 'string');
});

test('Tool: missing required field throws with the tool name in the message', () => {
  assert.throws(
    () => new Tool({ description: 'd', inputs: {}, execute: async () => '' }),
    /Tool "unnamed": name, description, inputs, and execute are required/
  );
  assert.throws(
    () => new Tool({ name: 'x', description: 'd', inputs: {} }),
    /Tool "x":/
  );
});

test('Tool: toOpenAISchema marks non-optional inputs as required', () => {
  const t = new Tool({
    name: 'search',
    description: 'web search',
    inputs: {
      q: { type: 'string', description: 'query' },
      limit: { type: 'number', description: 'max results', optional: true }
    },
    execute: async () => ''
  });
  const schema = t.toOpenAISchema();
  assert.equal(schema.type, 'function');
  assert.equal(schema.function.name, 'search');
  assert.equal(schema.function.description, 'web search');
  assert.deepEqual(schema.function.parameters.properties.q, { type: 'string', description: 'query' });
  assert.deepEqual(schema.function.parameters.properties.limit, { type: 'number', description: 'max results' });
  assert.deepEqual(schema.function.parameters.required, ['q']);
});

test('Tool: toOpenAISchema returns empty required array when all inputs are optional', () => {
  const t = new Tool({
    name: 'noop',
    description: 'no required',
    inputs: { x: { type: 'string', description: 'x', optional: true } },
    execute: async () => ''
  });
  assert.deepEqual(t.toOpenAISchema().function.parameters.required, []);
});

test('tool() shorthand returns a Tool instance', () => {
  const t = tool({
    name: 'shorthand',
    description: 'd',
    inputs: { a: { type: 'string', description: 'a' } },
    execute: async () => ''
  });
  assert.ok(t instanceof Tool);
  assert.equal(t.name, 'shorthand');
});
