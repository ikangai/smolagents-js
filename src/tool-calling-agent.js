import { Agent } from './agent.js';
import { toolCallingSystemPrompt } from './prompts.js';

export class ToolCallingAgent extends Agent {
  buildSystemPrompt() {
    return toolCallingSystemPrompt(Object.values(this.tools), this.managedAgents);
  }

  getToolSchemas() {
    return Object.values(this._getAllTools()).map(t => t.toOpenAISchema());
  }

  extractAction(response) {
    if (!response.tool_calls || response.tool_calls.length === 0) return null;
    const call = response.tool_calls[0];
    const args = typeof call.function.arguments === 'string'
      ? JSON.parse(call.function.arguments)
      : call.function.arguments;
    return { toolName: call.function.name, args, callId: call.id };
  }

  async executeAction({ toolName, args }) {
    const allTools = this._getAllTools();
    const tool = allTools[toolName];
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  appendActionToHistory(response, action, result) {
    this.history.push({
      role: 'assistant',
      content: response.content || null,
      tool_calls: response.tool_calls
    });
    this.history.push({
      role: 'tool',
      tool_call_id: action.callId,
      content: result
    });
  }
}
