export class Tool {
  constructor({ name, description, inputs, outputType = 'string', execute }) {
    if (!name || !description || !inputs || !execute) {
      throw new Error(`Tool "${name ?? 'unnamed'}": name, description, inputs, and execute are required`);
    }
    Object.assign(this, { name, description, inputs, outputType, execute });
  }

  toOpenAISchema() {
    const properties = {}, required = [];
    for (const [key, def] of Object.entries(this.inputs)) {
      properties[key] = { type: def.type, description: def.description };
      if (!def.optional) required.push(key);
    }
    return {
      type: 'function',
      function: { name: this.name, description: this.description, parameters: { type: 'object', properties, required } }
    };
  }
}

export const tool = (config) => new Tool(config);
