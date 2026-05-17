import { EventEmitter } from './events.js';
import { Model } from './model.js';

export class Agent extends EventEmitter {
  constructor({ model, tools = [], managedAgents = [], maxSteps = 10 }) {
    super();
    this.model = model instanceof Model ? model : new Model(model);
    this.tools = Object.fromEntries(tools.map(t => [t.name, t]));
    Object.assign(this, { managedAgents, maxSteps, status: 'idle', currentStep: 0, history: [] });
  }

  getState() {
    return { status: this.status, currentStep: this.currentStep, maxSteps: this.maxSteps, history: [...this.history] };
  }

  async run(task) {
    if (this.status === 'running') throw new Error('Agent is already running');
    this.status = 'running';
    this.currentStep = 0;
    this.history = [{ role: 'system', content: this.buildSystemPrompt() }, { role: 'user', content: task }];
    try {
      while (this.currentStep < this.maxSteps) {
        this.currentStep++;
        this.emit('think', { agent: this.name, step: this.currentStep, messages: this.history });
        const response = await this.callModel();
        const action = this.extractAction(response);
        if (!action) {
          const answer = response.content || '';
          this.history.push({ role: 'assistant', content: answer });
          this.status = 'done';
          this.emit('done', { agent: this.name, result: answer, totalSteps: this.currentStep });
          return answer;
        }
        this.emit('act', { agent: this.name, step: this.currentStep, ...action });
        let result;
        try {
          result = await this.executeAction(action);
        } catch (err) {
          result = `Error: ${err.message}`;
          this.emit('error', { agent: this.name, step: this.currentStep, error: err, recoverable: true });
        }
        this.appendActionToHistory(response, action, result);
        this.emit('observe', { agent: this.name, step: this.currentStep, result });
      }
      this.status = 'error';
      const err = new Error(`Max steps (${this.maxSteps}) reached without final answer`);
      this.emit('error', { agent: this.name, step: this.currentStep, error: err, recoverable: false });
      throw err;
    } catch (err) { this.status = 'error'; throw err; }
  }

  buildSystemPrompt() { throw new Error('Not implemented'); }
  extractAction() { throw new Error('Not implemented'); }
  async executeAction() { throw new Error('Not implemented'); }
  appendActionToHistory() { throw new Error('Not implemented'); }
  callModel() { return this.model.generate(this.history, this.getToolSchemas()); }
  getToolSchemas() { return []; }
  get name() { return this.constructor.name; }

  _getAllTools() {
    const tools = { ...this.tools };
    for (const ma of this.managedAgents) tools[ma.name] = ma.toTool();
    return tools;
  }
}
