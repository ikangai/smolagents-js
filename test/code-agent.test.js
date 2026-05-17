import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CodeAgent } from '../src/code-agent.js';
import { ManagedAgent } from '../src/managed-agent.js';
import { ToolCallingAgent } from '../src/tool-calling-agent.js';
import { tool } from '../src/tool.js';

const fakeModel = { apiKey: 'k', id: 'm' };

// CodeAgent.constructor builds a Sandbox which is browser-only at runtime.
// Constructing it in Node is fine — execute() would touch the DOM, but
// extractAction / buildSystemPrompt do not.
let savedDocument, savedWindow;
before(() => {
  savedDocument = globalThis.document;
  savedWindow = globalThis.window;
  globalThis.document = {
    createElement: () => ({ style: {}, sandbox: '' }),
    body: { appendChild() {} }
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
});
after(() => {
  globalThis.document = savedDocument;
  globalThis.window = savedWindow;
});

function makeAgent(extra = {}) {
  return new CodeAgent({ model: fakeModel, tools: [], ...extra });
}

test('CodeAgent.extractAction: returns null when no code block present', () => {
  const agent = makeAgent();
  assert.equal(agent.extractAction({ content: 'just a plain answer' }), null);
  assert.equal(agent.extractAction({ content: '' }), null);
  assert.equal(agent.extractAction({}), null);
});

test('CodeAgent.extractAction: matches ```js fence and returns trimmed code', () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    content: 'Let me try:\n```js\nconst x = 1;\nreturn x;\n```\nDone.'
  });
  assert.equal(action.type, 'code');
  assert.equal(action.code, 'const x = 1;\nreturn x;');
});

test('CodeAgent.extractAction: matches ```javascript fence as well', () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    content: '```javascript\nreturn 42;\n```'
  });
  assert.equal(action.type, 'code');
  assert.equal(action.code, 'return 42;');
});

test('CodeAgent.extractAction: extracts only the FIRST code block when multiple are present', () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    content: '```js\nfirst;\n```\nthen\n```js\nsecond;\n```'
  });
  assert.equal(action.code, 'first;');
});

test('CodeAgent.extractAction: does not match a fence without a language tag', () => {
  const agent = makeAgent();
  const action = agent.extractAction({
    content: '```\nsome code\n```'
  });
  assert.equal(action, null);
});

test('CodeAgent.buildSystemPrompt: lists tools as await-callable functions', () => {
  const t1 = tool({ name: 'search', description: 's', inputs: { q: { type: 'string', description: 'q' } }, execute: async () => '' });
  const t2 = tool({ name: 'calc', description: 'c', inputs: { x: { type: 'number', description: 'x' } }, execute: async () => '' });
  const agent = new CodeAgent({ model: fakeModel, tools: [t1, t2] });
  const prompt = agent.buildSystemPrompt();
  assert.match(prompt, /await search\(args\)/);
  assert.match(prompt, /await calc\(args\)/);
});

test('CodeAgent.buildSystemPrompt: lists managed agents exactly once (S6 dedup fix from 8d39ea4)', () => {
  const sub = new ToolCallingAgent({ model: fakeModel, tools: [] });
  const ma = new ManagedAgent({ agent: sub, name: 'researcher', description: 'research' });
  const agent = new CodeAgent({ model: fakeModel, tools: [], managedAgents: [ma] });
  const prompt = agent.buildSystemPrompt();
  // Must appear in the "agents" section as a typed call signature
  assert.match(prompt, /await researcher\(\{ task: "\.\.\." \}\)/);
  // And must appear exactly once total (the S6 fix used Object.keys(this.tools)
  // instead of _getAllTools(), so managed agents are not duplicated as tools)
  assert.equal((prompt.match(/researcher/g) || []).length, 1);
});

test('CodeAgent: getToolSchemas returns empty array (no schemas sent to API)', () => {
  const t = tool({ name: 'x', description: 'x', inputs: { a: { type: 'string', description: 'a' } }, execute: async () => '' });
  const agent = new CodeAgent({ model: fakeModel, tools: [t] });
  assert.deepEqual(agent.getToolSchemas(), []);
});

test('CodeAgent.appendActionToHistory: appends assistant response then a tool-result user message', () => {
  const agent = makeAgent();
  agent.history = [];
  const response = { content: '```js\nreturn 1;\n```' };
  const action = { type: 'code', code: 'return 1;' };
  agent.appendActionToHistory(response, action, '42');
  assert.equal(agent.history.length, 2);
  assert.equal(agent.history[0].role, 'assistant');
  assert.equal(agent.history[0].content, response.content);
  assert.equal(agent.history[1].role, 'user');
  assert.match(agent.history[1].content, /Code execution result.*42/);
});
