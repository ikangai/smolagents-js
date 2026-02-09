# smolagents-js

A compact, browser-first JavaScript agent library inspired by [smolagents](https://github.com/huggingface/smolagents). Zero dependencies. ~480 lines of code.

Build LLM-powered agents that think, use tools, write code, and orchestrate sub-agents — all running in the browser via [OpenRouter](https://openrouter.ai).

## Features

- **ToolCallingAgent** -- LLM picks tools via OpenAI-style function calling
- **CodeAgent** -- LLM writes JavaScript executed in a sandboxed iframe
- **Multi-agent orchestration** -- manager agents delegate to specialist sub-agents
- **Event system** -- real-time `think`/`act`/`observe`/`done` events for building UIs
- **Browser-first** -- ESM modules, no build step required

## Quick Start

Serve the project with any static file server:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Open `examples/basic.html`, enter your [OpenRouter API key](https://openrouter.ai/keys), and hit Run.

## Usage

### Define Tools

```js
import { tool } from './src/index.js';

const getWeather = tool({
  name: 'get_weather',
  description: 'Get current weather for a city',
  inputs: {
    city: { type: 'string', description: 'City name' },
    units: { type: 'string', description: 'celsius or fahrenheit', optional: true }
  },
  outputType: 'string',
  execute: async ({ city }) => {
    const res = await fetch(`https://api.weather.com/${city}`);
    return res.text();
  }
});
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique tool identifier |
| `description` | `string` | Yes | Description shown to the LLM |
| `inputs` | `object` | Yes | Map of `{ type, description, optional? }` per parameter |
| `outputType` | `string` | No | Return type hint (default: `'string'`) |
| `execute` | `function` | Yes | Implementation. Receives `{ param1, param2, ... }` |

### ToolCallingAgent

The LLM decides which tools to call using structured function calling.

```js
import { ToolCallingAgent, Model } from './src/index.js';

const agent = new ToolCallingAgent({
  model: new Model({ apiKey: 'sk-or-...', id: 'anthropic/claude-sonnet-4-5' }),
  tools: [getWeather, searchTool],
  maxSteps: 10
});

agent.on('think',   e => console.log(`Step ${e.step}: thinking...`));
agent.on('act',     e => console.log(`Step ${e.step}: ${e.toolName}(${JSON.stringify(e.args)})`));
agent.on('observe', e => console.log(`Step ${e.step}: ${e.result}`));
agent.on('done',    e => console.log(`Done in ${e.totalSteps} steps`));

const answer = await agent.run('What is the weather in Berlin?');
```

### CodeAgent

The LLM writes JavaScript code blocks that execute in a sandboxed iframe. Tools are injected as callable async functions.

```js
import { CodeAgent, Model } from './src/index.js';

const agent = new CodeAgent({
  model: new Model({ apiKey: 'sk-or-...', id: 'anthropic/claude-sonnet-4-5' }),
  tools: [searchTool],
  maxSteps: 6,
  executionTimeout: 30000  // ms per code block
});

agent.on('act', ({ code }) => console.log('Generated code:', code));

try {
  const answer = await agent.run('Calculate the first 20 Fibonacci numbers');
} finally {
  agent.destroy(); // always clean up the sandbox iframe
}
```

The LLM-generated code runs in an `<iframe sandbox="allow-scripts">` with no access to the parent DOM, network, or storage. Tools are the only way the code can interact with the outside world.

### Multi-Agent Orchestration

Wrap any agent as a `ManagedAgent` and give it to a manager. The manager sees sub-agents as tools it can delegate to.

```js
import { ToolCallingAgent, ManagedAgent, Model } from './src/index.js';

// Specialist agents
const researcher = new ToolCallingAgent({
  model: new Model({ apiKey: 'sk-or-...', id: 'anthropic/claude-sonnet-4-5' }),
  tools: [webSearchTool],
  maxSteps: 5
});

const calculator = new ToolCallingAgent({
  model: new Model({ apiKey: 'sk-or-...', id: 'anthropic/claude-sonnet-4-5' }),
  tools: [calcTool],
  maxSteps: 5
});

// Wrap as managed agents
const managedResearcher = new ManagedAgent({
  agent: researcher,
  name: 'researcher',
  description: 'Searches the web for factual information'
});

const managedCalculator = new ManagedAgent({
  agent: calculator,
  name: 'calculator',
  description: 'Evaluates math expressions'
});

// Manager delegates to sub-agents
const manager = new ToolCallingAgent({
  model: new Model({ apiKey: 'sk-or-...', id: 'anthropic/claude-sonnet-4-5' }),
  managedAgents: [managedResearcher, managedCalculator],
  maxSteps: 10
});

const result = await manager.run('How many football stadiums would seat Tokyo?');
```

### Events

All agents emit events during execution:

| Event | Data | When |
|-------|------|------|
| `think` | `{ agent, step, messages }` | Before each LLM call |
| `act` | `{ agent, step, toolName, args }` (ToolCalling) or `{ agent, step, code }` (Code) | After extracting an action |
| `observe` | `{ agent, step, result }` | After action execution |
| `error` | `{ agent, step, error, recoverable }` | On tool error or max steps |
| `done` | `{ agent, result, totalSteps }` | When final answer is produced |

```js
agent.on('think', callback);
agent.off('think', callback);
```

### Agent State

```js
const state = agent.getState();
// { status: 'running', currentStep: 3, maxSteps: 10, history: [...] }
```

Status values: `idle` | `running` | `done` | `error`

## API Reference

### `Tool(config)` / `tool(config)`

Creates a tool definition. `tool()` is a shorthand for `new Tool()`.

### `Model({ apiKey, id })`

OpenRouter API client. Requires an [OpenRouter API key](https://openrouter.ai/keys).

| Param | Type | Description |
|-------|------|-------------|
| `apiKey` | `string` | Your OpenRouter key |
| `id` | `string` | Model identifier, e.g. `anthropic/claude-sonnet-4-5` |

### `ToolCallingAgent({ model, tools?, managedAgents?, maxSteps? })`

Agent that uses structured function calling.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `Model` or config | -- | LLM to use |
| `tools` | `Tool[]` | `[]` | Available tools |
| `managedAgents` | `ManagedAgent[]` | `[]` | Sub-agents |
| `maxSteps` | `number` | `10` | Max ReAct iterations |

### `CodeAgent({ model, tools?, managedAgents?, maxSteps?, executionTimeout? })`

Agent that writes and executes JavaScript in a sandbox.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `Model` or config | -- | LLM to use |
| `tools` | `Tool[]` | `[]` | Available tools |
| `managedAgents` | `ManagedAgent[]` | `[]` | Sub-agents |
| `maxSteps` | `number` | `10` | Max ReAct iterations |
| `executionTimeout` | `number` | `30000` | Code execution timeout (ms) |

Call `agent.destroy()` when done to clean up the sandbox iframe.

### `ManagedAgent({ agent, name, description })`

Wraps an agent for use as a sub-agent in multi-agent orchestration.

| Param | Type | Description |
|-------|------|-------------|
| `agent` | `Agent` | The agent to wrap |
| `name` | `string` | Tool name the manager will use |
| `description` | `string` | Description shown to the manager LLM |

## Architecture

```
Agent (base class, ReAct loop)
  |-- ToolCallingAgent (parses tool_calls from LLM response)
  |-- CodeAgent (extracts JS code blocks, runs in Sandbox)

Tool         -- callable function with OpenAI schema
Model        -- OpenRouter API client
ManagedAgent -- wraps an Agent as a Tool for orchestration
EventEmitter -- on/off/emit mixin
Sandbox      -- iframe-based JS execution (internal)
```

The agent loop follows the **ReAct** pattern:

```
THINK  -->  LLM generates response
ACT    -->  Execute tool call or code block
OBSERVE --> Feed result back to LLM
Repeat until final answer or maxSteps reached
```

## File Structure

```
src/
  index.js              7 lines   Public exports
  events.js            20 lines   EventEmitter
  tool.js              33 lines   Tool class
  model.js             36 lines   OpenRouter client
  prompts.js           37 lines   System prompts
  managed-agent.js     36 lines   ManagedAgent
  tool-calling-agent.js 43 lines  ToolCallingAgent
  code-agent.js        43 lines   CodeAgent
  agent.js            105 lines   Base Agent (ReAct loop)
  sandbox.js          119 lines   iframe sandbox
examples/
  basic.html                      Single agent demo
  multi-agent.html                Multi-agent demo
  code-agent.html                 CodeAgent sandbox demo
```

## Examples

Open in browser after starting a local server:

- **`examples/basic.html`** -- ToolCallingAgent with a mock weather tool
- **`examples/multi-agent.html`** -- Manager delegates to researcher + calculator sub-agents
- **`examples/code-agent.html`** -- CodeAgent writes and runs JavaScript in a sandbox

## Requirements

- Modern browser with ES module support
- [OpenRouter API key](https://openrouter.ai/keys)

## License

MIT
