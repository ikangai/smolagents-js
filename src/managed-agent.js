import { Tool } from './tool.js';

export class ManagedAgent {
  constructor({ agent, name, description }) {
    if (!agent || !name || !description) throw new Error('ManagedAgent requires agent, name, and description');
    Object.assign(this, { agent, name, description });
  }

  toTool() {
    const a = this.agent;
    return new Tool({
      name: this.name,
      description: this.description,
      inputs: { task: { type: 'string', description: 'The task to delegate to this agent' } },
      execute: async ({ task }) => {
        const orig = a.emit;
        a.emit = (e, d) => orig.call(a, e, { ...d, depth: (d.depth ?? 0) + 1 });
        try { return await a.run(task); }
        finally { a.emit = orig; }
      }
    });
  }
}
