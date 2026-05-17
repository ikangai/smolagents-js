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
    const call = response.tool_calls?.[0];
    if (!call) return null;
    const raw = call.function.arguments;
    let args, parseError = null;
    try { args = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (e) { parseError = e; }
    return { toolName: call.function.name, args, callId: call.id, call, parseError };
  }

  async executeAction({ toolName, args, parseError }) {
    if (parseError) throw new Error(`Invalid JSON arguments for tool "${toolName}": ${parseError.message}`);
    const tool = this._getAllTools()[toolName];
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  appendActionToHistory(response, action, result) {
    this.history.push(
      { role: 'assistant', content: response.content || null, tool_calls: [action.call] },
      { role: 'tool', tool_call_id: action.callId, content: result }
    );
  }
}
