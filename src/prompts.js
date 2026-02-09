export function toolCallingSystemPrompt(tools, managedAgents = []) {
  const toolDescs = tools.map(t =>
    `- ${t.name}: ${t.description}`
  ).join('\n');

  const agentDescs = managedAgents.length > 0
    ? '\n\nYou can delegate tasks to these agents:\n' +
      managedAgents.map(a => `- ${a.name}: ${a.description}`).join('\n')
    : '';

  return `You are a helpful assistant that solves tasks step by step.

You have access to these tools:
${toolDescs}${agentDescs}

At each step, analyze the situation and call the appropriate tool.
When you have the final answer, respond with plain text (no tool calls).
Be concise. Prefer one tool call per step.`;
}

export function codeAgentSystemPrompt(toolNames, managedAgents = []) {
  const agentDescs = managedAgents.length > 0
    ? '\n\nYou can call these agents as functions:\n' +
      managedAgents.map(a => `- await ${a.name}({ task: "..." })`).join('\n')
    : '';

  return `You are a helpful assistant that solves tasks by writing JavaScript code.

You have these functions available:
${toolNames.map(n => `- await ${n}(args)`).join('\n')}${agentDescs}

At each step, write a JavaScript code block to make progress.
Wrap your code in a \`\`\`js code fence.
Use \`return\` to produce the step's output.
When you have the final answer, respond with plain text (no code block).
Be concise. Do not explain the code.`;
}
