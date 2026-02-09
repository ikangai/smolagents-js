export class Model {
  constructor({ apiKey, id }) {
    if (!apiKey || !id) throw new Error('Model requires apiKey and id');
    this.apiKey = apiKey;
    this.id = id;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
  }

  async generate(messages, tools = []) {
    const body = {
      model: this.id,
      messages
    };
    if (tools.length > 0) body.tools = tools;

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message;
  }
}
