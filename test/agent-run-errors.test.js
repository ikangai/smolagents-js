import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

function fakeModel(responses) {
  const queue = [...responses];
  return {
    apiKey: 'k',
    id: 'm',
    async generate() {
      if (queue.length === 0) throw new Error('test ran out of mocked responses');
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    }
  };
}

test('Agent.run: a throwing tool surfaces as "Error: ..." in observe, then the loop continues', async () => {
  const m = fakeModel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'boom', arguments: '{}' } }] },
    { role: 'assistant', content: 'recovered' }
  ]);
  const boom = tool({
    name: 'boom',
    description: 'always throws',
    inputs: { x: { type: 'string', description: 'x', optional: true } },
    execute: async () => { throw new Error('tool failed'); }
  });
  const agent = new ToolCallingAgent({ model: m, tools: [boom] });
  agent.model = m;
  const observed = [];
  agent.on('observe', (d) => observed.push(d.result));
  const errors = [];
  agent.on('error', (d) => errors.push(d));
  const result = await agent.run('q');
  assert.equal(result, 'recovered');
  assert.equal(observed[0], 'Error: tool failed');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].recoverable, true);
  assert.equal(errors[0].error.message, 'tool failed');
});

test('Agent.run: malformed JSON args surface as a clear error result, loop continues', async () => {
  const m = fakeModel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'add', arguments: '{not json' } }] },
    { role: 'assistant', content: 'gave up' }
  ]);
  const addTool = tool({
    name: 'add',
    description: 'add',
    inputs: { a: { type: 'number', description: 'a' } },
    execute: async ({ a }) => String(a * 2)
  });
  const agent = new ToolCallingAgent({ model: m, tools: [addTool] });
  agent.model = m;
  const observed = [];
  agent.on('observe', (d) => observed.push(d.result));
  const result = await agent.run('q');
  assert.equal(result, 'gave up');
  assert.match(observed[0], /Error: Invalid JSON arguments for tool "add"/);
});

test('Agent.run: hitting maxSteps emits error and rejects with a "Max steps" message', async () => {
  // Always returns a tool_call so the loop never terminates with a final answer.
  const m = {
    apiKey: 'k',
    id: 'm',
    async generate() {
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c', function: { name: 'echo', arguments: '{"x":"y"}' } }]
      };
    }
  };
  const echoTool = tool({
    name: 'echo',
    description: 'e',
    inputs: { x: { type: 'string', description: 'x' } },
    execute: async ({ x }) => x
  });
  const agent = new ToolCallingAgent({ model: m, tools: [echoTool], maxSteps: 3 });
  agent.model = m;
  const errors = [];
  agent.on('error', (d) => errors.push(d));
  await assert.rejects(() => agent.run('infinite'), /Max steps \(3\) reached without final answer/);
  assert.equal(agent.status, 'error');
  // One error with recoverable: false should have been emitted
  const fatal = errors.find(e => e.recoverable === false);
  assert.ok(fatal);
  assert.match(fatal.error.message, /Max steps \(3\)/);
});

test('Agent.run: when the model itself throws, the run rejects and status becomes error', async () => {
  const m = fakeModel([new Error('OpenRouter API error (500): server boom')]);
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  await assert.rejects(() => agent.run('q'), /OpenRouter API error \(500\)/);
  assert.equal(agent.status, 'error');
});

test('Agent.run: currentStep reflects the step at which max steps was reached', async () => {
  const m = {
    apiKey: 'k',
    id: 'm',
    async generate() {
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c', function: { name: 'echo', arguments: '{"x":"y"}' } }]
      };
    }
  };
  const echoTool = tool({
    name: 'echo',
    description: 'e',
    inputs: { x: { type: 'string', description: 'x' } },
    execute: async ({ x }) => x
  });
  const agent = new ToolCallingAgent({ model: m, tools: [echoTool], maxSteps: 4 });
  agent.model = m;
  await assert.rejects(() => agent.run('q'));
  assert.equal(agent.currentStep, 4);
});
