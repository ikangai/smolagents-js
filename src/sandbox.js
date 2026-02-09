export class Sandbox {
  constructor({ timeout = 30000, allowedGlobals = ['Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Promise', 'console'] } = {}) {
    this.timeout = timeout;
    this.allowedGlobals = allowedGlobals;
    this._iframe = null;
    this._messageId = 0;
    this._pending = {};
    this._onMessage = this._onMessage.bind(this);
  }

  init() {
    if (this._iframe) return;
    this._iframe = document.createElement('iframe');
    this._iframe.sandbox = 'allow-scripts';
    this._iframe.style.display = 'none';
    document.body.appendChild(this._iframe);
    window.addEventListener('message', this._onMessage);
  }

  destroy() {
    if (this._iframe) {
      window.removeEventListener('message', this._onMessage);
      this._iframe.remove();
      this._iframe = null;
    }
    for (const id of Object.keys(this._pending)) {
      this._pending[id].reject(new Error('Sandbox destroyed'));
      delete this._pending[id];
    }
  }

  async execute(code, toolStubs) {
    this.init();

    const id = ++this._messageId;

    const stubCode = Object.entries(toolStubs).map(([name, _]) =>
      `async function ${name}(args) {
        const callId = Math.random().toString(36).slice(2);
        parent.postMessage({ type: 'tool_call', id: ${id}, callId, tool: '${name}', args }, '*');
        return new Promise((resolve, reject) => {
          window.__pending = window.__pending || {};
          window.__pending[callId] = { resolve, reject };
        });
      }`
    ).join('\n');

    const wrappedCode = `
      <script>
        window.addEventListener('message', (e) => {
          if (e.data.type === 'tool_result' && window.__pending?.[e.data.callId]) {
            window.__pending[e.data.callId].resolve(e.data.result);
            delete window.__pending[e.data.callId];
          }
        });
        ${stubCode}
        (async () => {
          try {
            const __fn = new Function('${Object.keys(toolStubs).join("','")}',
              'return (async () => { ' + ${JSON.stringify(code)} + ' })()');
            const result = await __fn(${Object.keys(toolStubs).join(',')});
            parent.postMessage({ type: 'result', id: ${id}, result }, '*');
          } catch (err) {
            parent.postMessage({ type: 'error', id: ${id}, error: err.message }, '*');
          }
        })();
      <\/script>
    `;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete this._pending[id];
        this.destroy();
        reject(new Error('Sandbox execution timed out (' + this.timeout + 'ms)'));
      }, this.timeout);

      this._pending[id] = {
        resolve: (val) => { clearTimeout(timer); resolve(val); },
        reject: (err) => { clearTimeout(timer); reject(err); },
        toolStubs
      };

      this._iframe.srcdoc = wrappedCode;
    });
  }

  _onMessage(event) {
    const { data } = event;
    if (!data || !data.id) return;

    if (data.type === 'tool_call') {
      const pending = this._pending[data.id];
      if (!pending) return;
      const toolFn = pending.toolStubs[data.tool];
      if (!toolFn) return;
      toolFn(data.args).then(result => {
        this._iframe?.contentWindow?.postMessage(
          { type: 'tool_result', callId: data.callId, result },
          '*'
        );
      });
    }

    if (data.type === 'result') {
      this._pending[data.id]?.resolve(data.result);
      delete this._pending[data.id];
    }

    if (data.type === 'error') {
      this._pending[data.id]?.reject(new Error(data.error));
      delete this._pending[data.id];
    }
  }
}
