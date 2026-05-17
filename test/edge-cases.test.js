import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from '../src/events.js';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

test('Agent.callModel: forwards history and computed tool schemas to model.generate', async () => {
  let observed;
  const m = {
    apiKey: 'k', id: 'm',
    async generate(history, tools) {
      observed = { history, tools };
      return { role: 'assistant', content: 'ok' };
    }
  };
  const t = tool({
    name: 'add',
    description: 'add',
    inputs: { a: { type: 'number', description: 'a' } },
    execute: async () => ''
  });
  const agent = new ToolCallingAgent({ model: m, tools: [t] });
  agent.model = m;
  agent.history = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'u' }];
  await agent.callModel();
  assert.deepEqual(observed.history[1], { role: 'user', content: 'u' });
  assert.equal(observed.tools.length, 1);
  assert.equal(observed.tools[0].function.name, 'add');
});

test('EventEmitter.off: removing an unregistered listener is a safe no-op', () => {
  const ee = new EventEmitter();
  const fn = () => {};
  assert.doesNotThrow(() => ee.off('never-emitted', fn));
  // After off on an unknown event, the on/emit cycle still works
  let called = false;
  ee.on('x', () => { called = true; });
  ee.emit('x');
  assert.equal(called, true);
});

test('EventEmitter.off: removes only the matching listener, others remain', () => {
  const ee = new EventEmitter();
  const calls = [];
  const a = () => calls.push('a');
  const b = () => calls.push('b');
  const c = () => calls.push('c');
  ee.on('e', a);
  ee.on('e', b);
  ee.on('e', c);
  ee.off('e', b);
  ee.emit('e');
  assert.deepEqual(calls, ['a', 'c']);
});

test('EventEmitter: removing a listener twice does nothing the second time', () => {
  const ee = new EventEmitter();
  let n = 0;
  const fn = () => { n++; };
  ee.on('x', fn);
  ee.off('x', fn);
  ee.off('x', fn);
  ee.emit('x');
  assert.equal(n, 0);
});

test('Tool.execute: a tool returning a sync (non-Promise) value still works via await', async () => {
  const t = tool({
    name: 'sync',
    description: 'returns a value synchronously',
    inputs: { x: { type: 'string', description: 'x' } },
    execute: ({ x }) => x.toUpperCase()
  });
  // The Agent will await the result; awaiting a non-thenable returns it as-is.
  const r = await t.execute({ x: 'hi' });
  assert.equal(r, 'HI');
});

test('Agent.run: sets status=running while in flight then done on completion', async () => {
  let statusDuringGenerate;
  const m = {
    apiKey: 'k', id: 'm',
    async generate() {
      statusDuringGenerate = agent.status;
      return { role: 'assistant', content: 'final' };
    }
  };
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  await agent.run('q');
  assert.equal(statusDuringGenerate, 'running');
  assert.equal(agent.status, 'done');
});

test('Agent.run: resets currentStep at the start of each run', async () => {
  const m = {
    apiKey: 'k', id: 'm',
    async generate() { return { role: 'assistant', content: 'x' }; }
  };
  const agent = new ToolCallingAgent({ model: m });
  agent.model = m;
  await agent.run('first');
  assert.equal(agent.currentStep, 1);
  await agent.run('second');
  assert.equal(agent.currentStep, 1, 'currentStep should restart at 0 then increment to 1');
});
