import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

function queuedModel(responses) {
  const queue = [...responses];
  return {
    apiKey: 'k',
    id: 'm',
    async generate() {
      if (queue.length === 0) throw new Error('out of mocked responses');
      return queue.shift();
    }
  };
}

function counterTool() {
  return tool({
    name: 'inc',
    description: 'increment counter',
    inputs: { n: { type: 'number', description: 'n' } },
    execute: async ({ n }) => String(n + 1)
  });
}

test('Agent.history: accumulates correctly across multiple tool turns', async () => {
  const m = queuedModel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'a1', function: { name: 'inc', arguments: '{"n":1}' } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'a2', function: { name: 'inc', arguments: '{"n":2}' } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'a3', function: { name: 'inc', arguments: '{"n":3}' } }] },
    { role: 'assistant', content: 'final: 4' }
  ]);
  const agent = new ToolCallingAgent({ model: m, tools: [counterTool()] });
  agent.model = m;
  await agent.run('start');
  // Expected sequence: system, user, [assistant+tool_calls, tool] x 3, assistant(final)
  // = 2 + 6 + 1 = 9
  assert.equal(agent.history.length, 9);
  // Every odd-positioned tool message must reference the immediately preceding assistant call
  const ids = ['a1', 'a2', 'a3'];
  for (let i = 0; i < ids.length; i++) {
    const assistant = agent.history[2 + i * 2];
    const toolMsg = agent.history[3 + i * 2];
    assert.equal(assistant.role, 'assistant');
    assert.equal(assistant.tool_calls.length, 1, 'each assistant message must carry exactly one tool_call');
    assert.equal(assistant.tool_calls[0].id, ids[i]);
    assert.equal(toolMsg.role, 'tool');
    assert.equal(toolMsg.tool_call_id, ids[i]);
  }
  // Last message is the final answer
  assert.equal(agent.history[8].role, 'assistant');
  assert.equal(agent.history[8].content, 'final: 4');
});

test('Agent.history: parallel tool_calls in one LLM response still record only one tool_call per assistant message', async () => {
  // Model returns 2 parallel tool_calls on the first round; agent must execute only the first
  // and the resulting history must NOT include the dropped one (else OpenRouter would reject).
  const m = queuedModel([
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'a1', function: { name: 'inc', arguments: '{"n":1}' } },
        { id: 'a2', function: { name: 'inc', arguments: '{"n":99}' } }
      ]
    },
    { role: 'assistant', content: 'done' }
  ]);
  const agent = new ToolCallingAgent({ model: m, tools: [counterTool()] });
  agent.model = m;
  await agent.run('q');
  const assistantWithCalls = agent.history.find(m => m.role === 'assistant' && m.tool_calls);
  assert.equal(assistantWithCalls.tool_calls.length, 1, 'history must NOT carry the unanswered second call');
  assert.equal(assistantWithCalls.tool_calls[0].id, 'a1');
});

test('Agent.history: every tool message has a tool_call_id that matches an assistant tool_calls entry', async () => {
  const m = queuedModel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'a1', function: { name: 'inc', arguments: '{"n":0}' } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'a2', function: { name: 'inc', arguments: '{"n":1}' } }] },
    { role: 'assistant', content: 'final' }
  ]);
  const agent = new ToolCallingAgent({ model: m, tools: [counterTool()] });
  agent.model = m;
  await agent.run('q');
  const assistantCallIds = agent.history
    .filter(m => m.role === 'assistant' && m.tool_calls)
    .flatMap(m => m.tool_calls.map(c => c.id));
  const toolMessageIds = agent.history
    .filter(m => m.role === 'tool')
    .map(m => m.tool_call_id);
  assert.deepEqual(toolMessageIds, assistantCallIds, 'every assistant tool_call must have a matching tool message');
});

test('Agent.history: a second agent.run starts fresh (replaces prior history)', async () => {
  const m = queuedModel([
    { role: 'assistant', content: 'one' },
    { role: 'assistant', content: 'two' }
  ]);
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  await agent.run('first');
  const firstLen = agent.history.length;
  await agent.run('second');
  // Second run rebuilds history from scratch (system + user + assistant)
  assert.equal(agent.history.length, firstLen);
  assert.equal(agent.history[1].content, 'second');
});
