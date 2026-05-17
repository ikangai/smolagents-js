import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

function fakeModelWithResponses(responses) {
  const queue = [...responses];
  return {
    apiKey: 'k',
    id: 'm',
    async generate() {
      if (queue.length === 0) throw new Error('test ran out of mocked responses');
      return queue.shift();
    }
  };
}

function recordEvents(agent) {
  const events = [];
  for (const name of ['think', 'act', 'observe', 'error', 'done']) {
    agent.on(name, (data) => events.push({ name, data }));
  }
  return events;
}

test('Agent.run: returns immediately with content when LLM emits no tool_calls', async () => {
  const m = fakeModelWithResponses([{ role: 'assistant', content: 'final answer' }]);
  const agent = new ToolCallingAgent({ model: m });
  // Replace internal model with our fake (the constructor wrapped it in a Model).
  agent.model = m;
  const result = await agent.run('what is 2+2?');
  assert.equal(result, 'final answer');
  assert.equal(agent.status, 'done');
  assert.equal(agent.currentStep, 1);
});

test('Agent.run: seeds history with system + user messages at the start', async () => {
  const m = fakeModelWithResponses([{ role: 'assistant', content: 'done' }]);
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  await agent.run('hello');
  assert.equal(agent.history[0].role, 'system');
  assert.equal(agent.history[1].role, 'user');
  assert.equal(agent.history[1].content, 'hello');
});

test('Agent.run: one tool round-trip then final answer (think→act→observe→think→done)', async () => {
  const m = fakeModelWithResponses([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', function: { name: 'add', arguments: '{"a":1,"b":2}' } }]
    },
    { role: 'assistant', content: 'the sum is 3' }
  ]);
  const addTool = tool({
    name: 'add',
    description: 'add',
    inputs: { a: { type: 'number', description: 'a' }, b: { type: 'number', description: 'b' } },
    execute: async ({ a, b }) => String(a + b)
  });
  const agent = new ToolCallingAgent({ model: m, tools: [addTool] });
  agent.model = m;
  const events = recordEvents(agent);
  const result = await agent.run('what is 1+2?');
  assert.equal(result, 'the sum is 3');
  assert.equal(agent.status, 'done');
  assert.equal(agent.currentStep, 2);
  const seq = events.map(e => e.name);
  assert.deepEqual(seq, ['think', 'act', 'observe', 'think', 'done']);
});

test('Agent.run: emits act event with toolName + args from the parsed tool_call', async () => {
  const m = fakeModelWithResponses([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', function: { name: 'add', arguments: '{"a":3,"b":4}' } }]
    },
    { role: 'assistant', content: 'done' }
  ]);
  const addTool = tool({
    name: 'add',
    description: 'add',
    inputs: { a: { type: 'number', description: 'a' }, b: { type: 'number', description: 'b' } },
    execute: async ({ a, b }) => String(a + b)
  });
  const agent = new ToolCallingAgent({ model: m, tools: [addTool] });
  agent.model = m;
  let actEvent;
  agent.on('act', (d) => { actEvent = d; });
  await agent.run('go');
  assert.equal(actEvent.toolName, 'add');
  assert.deepEqual(actEvent.args, { a: 3, b: 4 });
  assert.equal(actEvent.step, 1);
});

test('Agent.run: observe event carries the stringified tool result', async () => {
  const m = fakeModelWithResponses([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c', function: { name: 'echo', arguments: '{"x":"hi"}' } }] },
    { role: 'assistant', content: 'fine' }
  ]);
  const echoTool = tool({
    name: 'echo',
    description: 'e',
    inputs: { x: { type: 'string', description: 'x' } },
    execute: async ({ x }) => x
  });
  const agent = new ToolCallingAgent({ model: m, tools: [echoTool] });
  agent.model = m;
  let observed;
  agent.on('observe', (d) => { observed = d; });
  await agent.run('q');
  assert.equal(observed.result, 'hi');
});

test('Agent.run: done event reports the final result and totalSteps', async () => {
  const m = fakeModelWithResponses([{ role: 'assistant', content: 'answer' }]);
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  let doneEvent;
  agent.on('done', (d) => { doneEvent = d; });
  await agent.run('q');
  assert.equal(doneEvent.result, 'answer');
  assert.equal(doneEvent.totalSteps, 1);
});
