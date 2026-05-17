import { Agent } from './agent.js';
import { Sandbox } from './sandbox.js';
import { codeAgentSystemPrompt } from './prompts.js';

export class CodeAgent extends Agent {
  constructor(opts) {
    super(opts);
    this.sandbox = new Sandbox({ timeout: opts.executionTimeout ?? 30000, allowedGlobals: opts.allowedGlobals });
  }

  buildSystemPrompt() {
    return codeAgentSystemPrompt(Object.keys(this.tools), this.managedAgents);
  }

  extractAction(response) {
    const match = (response.content || '').match(/```(?:js|javascript)\n([\s\S]*?)```/);
    return match ? { type: 'code', code: match[1].trim() } : null;
  }

  async executeAction({ code }) {
    const stubs = Object.fromEntries(
      Object.entries(this._getAllTools()).map(([n, t]) => [n, (a) => t.execute(a)])
    );
    const result = await this.sandbox.execute(code, stubs);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  appendActionToHistory(response, action, result) {
    this.history.push(
      { role: 'assistant', content: response.content },
      { role: 'user', content: `[Code execution result]: ${result}` }
    );
  }

  destroy() { this.sandbox.destroy(); }
}
