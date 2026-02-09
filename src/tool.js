export class Tool {
  constructor({ name, description, inputs, outputType, execute }) {
    if (!name || !description || !inputs || !execute) {
      throw new Error(`Tool "${name ?? 'unnamed'}": name, description, inputs, and execute are required`);
    }
    this.name = name;
    this.description = description;
    this.inputs = inputs;
    this.outputType = outputType ?? 'string';
    this.execute = execute;
  }

  toOpenAISchema() {
    const properties = {};
    const required = [];
    for (const [key, def] of Object.entries(this.inputs)) {
      properties[key] = { type: def.type, description: def.description };
      if (!def.optional) required.push(key);
    }
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: { type: 'object', properties, required }
      }
    };
  }
}

export function tool(config) {
  return new Tool(config);
}
