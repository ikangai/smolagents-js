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
    return { toolName: call.function.name, rawArgs: call.function.arguments, callId: call.id, call };
  }

  async executeAction({ toolName, rawArgs }) {
    const allTools = this._getAllTools();
    const tool = allTools[toolName];
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    let args;
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs);
      } catch (err) {
        throw new Error(`Invalid JSON arguments for tool "${toolName}": ${err.message}`);
      }
    } else {
      args = rawArgs;
    }
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  appendActionToHistory(response, action, result) {
    this.history.push({
      role: 'assistant',
      content: response.content || null,
      tool_calls: [action.call]
    });
    this.history.push({
      role: 'tool',
      tool_call_id: action.callId,
      content: result
    });
  }
}
