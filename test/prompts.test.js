import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toolCallingSystemPrompt, codeAgentSystemPrompt } from '../src/prompts.js';

function fakeTool(name, description) {
  return { name, description };
}

test('toolCallingSystemPrompt: includes each tool name and description as a bullet', () => {
  const prompt = toolCallingSystemPrompt([
    fakeTool('search', 'web search'),
    fakeTool('calc', 'evaluate math')
  ]);
  assert.match(prompt, /- search: web search/);
  assert.match(prompt, /- calc: evaluate math/);
});

test('toolCallingSystemPrompt: omits the managed-agents section when there are none', () => {
  const prompt = toolCallingSystemPrompt([fakeTool('search', 's')]);
  assert.equal(prompt.includes('delegate tasks to these agents'), false);
});

test('toolCallingSystemPrompt: includes a managed-agents section when provided', () => {
  const prompt = toolCallingSystemPrompt(
    [fakeTool('search', 's')],
    [{ name: 'researcher', description: 'web research' }]
  );
  assert.match(prompt, /You can delegate tasks to these agents/);
  assert.match(prompt, /- researcher: web research/);
});

test('toolCallingSystemPrompt: handles an empty tools list without crashing', () => {
  assert.doesNotThrow(() => toolCallingSystemPrompt([]));
});

test('toolCallingSystemPrompt: instructs LLM to call tools step-by-step and respond plain when done', () => {
  const prompt = toolCallingSystemPrompt([fakeTool('t', 'd')]);
  assert.match(prompt, /analyze the situation/i);
  assert.match(prompt, /final answer.*plain text.*no tool calls/i);
});

test('codeAgentSystemPrompt: formats each tool as an awaitable function', () => {
  const prompt = codeAgentSystemPrompt(['search', 'calc']);
  assert.match(prompt, /- await search\(args\)/);
  assert.match(prompt, /- await calc\(args\)/);
});

test('codeAgentSystemPrompt: omits the managed-agents section when there are none', () => {
  const prompt = codeAgentSystemPrompt(['search']);
  assert.equal(prompt.includes('You can call these agents as functions'), false);
});

test('codeAgentSystemPrompt: lists managed agents as typed awaitable signatures', () => {
  const prompt = codeAgentSystemPrompt(
    ['search'],
    [{ name: 'researcher', description: 'web research' }]
  );
  assert.match(prompt, /You can call these agents as functions/);
  assert.match(prompt, /- await researcher\(\{ task: "\.\.\." \}\)/);
});

test('codeAgentSystemPrompt: instructs LLM to wrap code in ```js and return for output', () => {
  const prompt = codeAgentSystemPrompt(['t']);
  assert.match(prompt, /```js code fence/);
  assert.match(prompt, /Use `return` to produce/);
  assert.match(prompt, /final answer.*plain text.*no code block/i);
});
