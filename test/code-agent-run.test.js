import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CodeAgent } from '../src/code-agent.js';
import { tool } from '../src/tool.js';

const fakeModel = (responses) => {
  const queue = [...responses];
  return {
    apiKey: 'k', id: 'm',
    async generate() {
      if (queue.length === 0) throw new Error('out of mocked responses');
      return queue.shift();
    }
  };
};

let savedDocument, savedWindow;
before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  globalThis.document = { createElement: () => ({ style: {}, sandbox: '' }), body: { appendChild() {} } };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
});
after(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});

test('CodeAgent.run: returns content with no code fence as the final answer immediately', async () => {
  const m = fakeModel([{ role: 'assistant', content: 'just a plain answer, no code' }]);
  const agent = new CodeAgent({ model: m });
  agent.model = m;
  const result = await agent.run('hi');
  assert.equal(result, 'just a plain answer, no code');
  assert.equal(agent.currentStep, 1);
});

test('CodeAgent.run: extracts code, runs it via sandbox, feeds result back, then returns final answer', async () => {
  const m = fakeModel([
    { role: 'assistant', content: 'Computing.\n```js\nreturn 1 + 2;\n```' },
    { role: 'assistant', content: 'the answer is 3' }
  ]);
  const agent = new CodeAgent({ model: m });
  agent.model = m;
  let observedCode;
  agent.sandbox.execute = async (code) => {
    observedCode = code;
    return '3';
  };
  const result = await agent.run('what is 1+2?');
  assert.equal(observedCode, 'return 1 + 2;');
  assert.equal(result, 'the answer is 3');
  assert.equal(agent.currentStep, 2);
});

test('CodeAgent.run: emits act event with the extracted code', async () => {
  const m = fakeModel([
    { role: 'assistant', content: '```js\nconst x = 42; return x;\n```' },
    { role: 'assistant', content: 'final' }
  ]);
  const agent = new CodeAgent({ model: m });
  agent.model = m;
  agent.sandbox.execute = async () => '42';
  let actEvent;
  agent.on('act', (d) => { actEvent = d; });
  await agent.run('q');
  assert.equal(actEvent.code, 'const x = 42; return x;');
  assert.equal(actEvent.type, 'code');
});

test('CodeAgent.run: sandbox error surfaces as a tool error in the observe event, loop continues', async () => {
  const m = fakeModel([
    { role: 'assistant', content: '```js\nreturn 1;\n```' },
    { role: 'assistant', content: 'recovered' }
  ]);
  const agent = new CodeAgent({ model: m });
  agent.model = m;
  agent.sandbox.execute = async () => { throw new Error('sandbox blew up'); };
  let observed;
  agent.on('observe', (d) => { observed = d.result; });
  const result = await agent.run('q');
  assert.equal(result, 'recovered');
  assert.equal(observed, 'Error: sandbox blew up');
});

test('CodeAgent.run: history records code-execution result as a user message', async () => {
  const m = fakeModel([
    { role: 'assistant', content: '```js\nreturn "computed";\n```' },
    { role: 'assistant', content: 'all done' }
  ]);
  const agent = new CodeAgent({ model: m });
  agent.model = m;
  agent.sandbox.execute = async () => 'computed';
  await agent.run('q');
  // history: system, user, assistant(code), user(result), assistant(final)
  assert.equal(agent.history.length, 5);
  assert.equal(agent.history[3].role, 'user');
  assert.match(agent.history[3].content, /Code execution result.*computed/);
});

test('CodeAgent.run: tool stubs inside sandbox.execute receive working tool.execute wrappers', async () => {
  const calls = [];
  const fakeTool = tool({
    name: 'echo',
    description: 'e',
    inputs: { x: { type: 'string', description: 'x' } },
    execute: async ({ x }) => { calls.push(x); return x; }
  });
  const m = fakeModel([
    { role: 'assistant', content: '```js\nreturn await echo({x:"hello"});\n```' },
    { role: 'assistant', content: 'done' }
  ]);
  const agent = new CodeAgent({ model: m, tools: [fakeTool] });
  agent.model = m;
  agent.sandbox.execute = async (_code, stubs) => stubs.echo({ x: 'hello' });
  await agent.run('q');
  assert.deepEqual(calls, ['hello']);
});
