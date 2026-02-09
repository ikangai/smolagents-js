import { Tool } from './tool.js';

export class ManagedAgent {
  constructor({ agent, name, description }) {
    if (!agent || !name || !description) {
      throw new Error('ManagedAgent requires agent, name, and description');
    }
    this.agent = agent;
    this.name = name;
    this.description = description;
  }

  toTool() {
    const ma = this;
    return new Tool({
      name: this.name,
      description: this.description,
      inputs: {
        task: { type: 'string', description: 'The task to delegate to this agent' }
      },
      outputType: 'string',
      execute: async ({ task }) => {
        const originalEmit = ma.agent.emit;
        ma.agent.emit = (event, data) => {
          originalEmit.call(ma.agent, event, { ...data, depth: (data.depth ?? 0) + 1 });
        };

        try {
          return await ma.agent.run(task);
        } finally {
          ma.agent.emit = originalEmit;
        }
      }
    });
  }
}
