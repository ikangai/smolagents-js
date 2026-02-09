import { EventEmitter } from './events.js';
import { Model } from './model.js';

export class Agent extends EventEmitter {
  constructor({ model, tools = [], managedAgents = [], maxSteps = 10 }) {
    super();
    this.model = model instanceof Model ? model : new Model(model);
    this.tools = {};
    for (const t of tools) this.tools[t.name] = t;
    this.managedAgents = managedAgents;
    this.maxSteps = maxSteps;
    this.status = 'idle';
    this.currentStep = 0;
    this.history = [];
  }

  getState() {
    return {
      status: this.status,
      currentStep: this.currentStep,
      maxSteps: this.maxSteps,
      history: [...this.history]
    };
  }

  async run(task) {
    this.status = 'running';
    this.currentStep = 0;
    this.history = [
      { role: 'system', content: this.buildSystemPrompt() },
      { role: 'user', content: task }
    ];

    try {
      while (this.currentStep < this.maxSteps) {
        this.currentStep++;

        // THINK
        this.emit('think', { agent: this.name, step: this.currentStep, messages: this.history });
        const response = await this.callModel();

        // Check for final answer (no action)
        const action = this.extractAction(response);
        if (!action) {
          const answer = response.content || '';
          this.history.push({ role: 'assistant', content: answer });
          this.status = 'done';
          this.emit('done', { agent: this.name, result: answer, totalSteps: this.currentStep });
          return answer;
        }

        // ACT
        this.emit('act', { agent: this.name, step: this.currentStep, ...action });
        let result;
        try {
          result = await this.executeAction(action);
        } catch (err) {
          result = `Error: ${err.message}`;
          this.emit('error', { agent: this.name, step: this.currentStep, error: err, recoverable: true });
        }

        // OBSERVE
        this.appendActionToHistory(response, action, result);
        this.emit('observe', { agent: this.name, step: this.currentStep, result });
      }

      // Max steps reached
      this.status = 'error';
      const msg = `Max steps (${this.maxSteps}) reached without final answer`;
      this.emit('error', { agent: this.name, step: this.currentStep, error: new Error(msg), recoverable: false });
      throw new Error(msg);
    } catch (err) {
      this.status = 'error';
      throw err;
    }
  }

  // Subclasses must implement these:
  buildSystemPrompt() { throw new Error('Not implemented'); }
  extractAction(response) { throw new Error('Not implemented'); }
  async executeAction(action) { throw new Error('Not implemented'); }
  appendActionToHistory(response, action, result) { throw new Error('Not implemented'); }

  async callModel() {
    const tools = this.getToolSchemas();
    return this.model.generate(this.history, tools);
  }

  getToolSchemas() {
    return [];
  }

  get name() {
    return this.constructor.name;
  }

  _getAllTools() {
    const tools = { ...this.tools };
    for (const ma of this.managedAgents) {
      const t = ma.toTool();
      tools[t.name] = t;
    }
    return tools;
  }
}
