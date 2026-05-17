import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { ManagedAgent } from '../src/managed-agent.js';
import { tool } from '../src/tool.js';

function queuedModel(responses) {
  const queue = [...responses];
  return {
    apiKey: 'k',
    id: 'm',
    async generate() {
      if (queue.length === 0) throw new Error('out of mocked responses');
      const r = queue.shift();
      if (r instanceof Error) throw r;
      return r;
    }
  };
}

test('multi-agent: manager.run delegates to a managed sub-agent and folds the result back in', async () => {
  // Sub-agent: returns "42" directly when asked
  const subModel = queuedModel([{ role: 'assistant', content: '42' }]);
  const sub = new ToolCallingAgent({ model: subModel });
  sub.model = subModel;

  const ma = new ManagedAgent({ agent: sub, name: 'oracle', description: 'answers ultimate questions' });

  // Manager: first response calls oracle, second returns final answer
  const mgrModel = queuedModel([
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', function: { name: 'oracle', arguments: '{"task":"meaning of life"}' } }]
    },
    { role: 'assistant', content: 'oracle says: 42' }
  ]);
  const mgr = new ToolCallingAgent({ model: mgrModel, managedAgents: [ma] });
  mgr.model = mgrModel;

  const result = await mgr.run('what is the meaning of life?');
  assert.equal(result, 'oracle says: 42');
});

test('multi-agent: getToolSchemas on the manager includes the managed agent as a callable tool', () => {
  const sub = new ToolCallingAgent({ model: { apiKey: 'k', id: 'm' } });
  const ma = new ManagedAgent({ agent: sub, name: 'oracle', description: 'd' });
  const mgr = new ToolCallingAgent({ model: { apiKey: 'k', id: 'm' }, managedAgents: [ma] });
  const schemas = mgr.getToolSchemas();
  assert.equal(schemas.length, 1);
  assert.equal(schemas[0].function.name, 'oracle');
  assert.deepEqual(schemas[0].function.parameters.required, ['task']);
});

test('multi-agent: history records the manager calling oracle and gets a string back', async () => {
  const subModel = queuedModel([{ role: 'assistant', content: 'sub-answer' }]);
  const sub = new ToolCallingAgent({ model: subModel });
  sub.model = subModel;
  const ma = new ManagedAgent({ agent: sub, name: 'oracle', description: 'd' });
  const mgrModel = queuedModel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'oracle', arguments: '{"task":"go"}' } }] },
    { role: 'assistant', content: 'done' }
  ]);
  const mgr = new ToolCallingAgent({ model: mgrModel, managedAgents: [ma] });
  mgr.model = mgrModel;
  await mgr.run('q');
  // history: system, user, assistant(tool_call), tool(result), assistant(final)
  assert.equal(mgr.history.length, 5);
  assert.equal(mgr.history[2].tool_calls[0].function.name, 'oracle');
  assert.equal(mgr.history[3].role, 'tool');
  assert.equal(mgr.history[3].content, 'sub-answer');
  assert.equal(mgr.history[4].content, 'done');
});

test('multi-agent: sub-agent failure surfaces back to the manager as a tool error', async () => {
  const subModel = queuedModel([new Error('sub blew up')]);
  const sub = new ToolCallingAgent({ model: subModel });
  sub.model = subModel;
  const ma = new ManagedAgent({ agent: sub, name: 'oracle', description: 'd' });
  const mgrModel = queuedModel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'oracle', arguments: '{"task":"go"}' } }] },
    { role: 'assistant', content: 'caught it' }
  ]);
  const mgr = new ToolCallingAgent({ model: mgrModel, managedAgents: [ma] });
  mgr.model = mgrModel;
  const observed = [];
  mgr.on('observe', (d) => observed.push(d.result));
  const result = await mgr.run('q');
  assert.equal(result, 'caught it');
  assert.match(observed[0], /Error: sub blew up/);
});
