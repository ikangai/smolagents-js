export class Model {
  constructor({ apiKey, id, baseUrl = 'https://openrouter.ai/api/v1/chat/completions' }) {
    if (!apiKey || !id) throw new Error('Model requires apiKey and id');
    Object.assign(this, { apiKey, id, baseUrl });
  }

  async generate(messages, tools = []) {
    const body = { model: this.id, messages, ...(tools.length && { tools }) };
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`OpenRouter API error (${res.status}): ${await res.text()}`);
    const data = await res.json();
    if (!data.choices?.[0]?.message) throw new Error(`OpenRouter API returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
    return data.choices[0].message;
  }
}
