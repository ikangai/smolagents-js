import { Agent } from './agent.js';
import { Sandbox } from './sandbox.js';
import { codeAgentSystemPrompt } from './prompts.js';

export class CodeAgent extends Agent {
  constructor(opts) {
    super(opts);
    this.sandbox = new Sandbox({
      timeout: opts.executionTimeout ?? 30000,
      allowedGlobals: opts.allowedGlobals
    });
  }

  buildSystemPrompt() {
    return codeAgentSystemPrompt(Object.keys(this.tools), this.managedAgents);
  }

  extractAction(response) {
    const content = response.content || '';
    const match = content.match(/```(?:js|javascript)\n([\s\S]*?)```/);
    if (!match) return null;
    return { type: 'code', code: match[1].trim() };
  }

  async executeAction({ code }) {
    const allTools = this._getAllTools();
    const toolStubs = {};
    for (const [name, tool] of Object.entries(allTools)) {
      toolStubs[name] = (args) => tool.execute(args);
    }
    const result = await this.sandbox.execute(code, toolStubs);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  appendActionToHistory(response, action, result) {
    this.history.push({ role: 'assistant', content: response.content });
    this.history.push({ role: 'user', content: `[Code execution result]: ${result}` });
  }

  destroy() {
    this.sandbox.destroy();
  }
}
