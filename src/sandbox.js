const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DEFAULT_GLOBALS = ['Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Promise', 'console'];

export class Sandbox {
  _iframe = null;
  _messageId = 0;
  _pending = Object.create(null);

  constructor({ timeout = 30000, allowedGlobals = DEFAULT_GLOBALS } = {}) {
    this.timeout = timeout;
    this.allowedGlobals = allowedGlobals;
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
    const err = new Error('Sandbox destroyed');
    for (const id of Object.keys(this._pending)) { this._pending[id].reject(err); delete this._pending[id]; }
  }

  async execute(code, toolStubs) {
    this.init();
    for (const name of Object.keys(toolStubs)) {
      if (!IDENT.test(name)) throw new Error(`Sandbox: tool name "${name}" is not a valid JavaScript identifier`);
    }
    const id = ++this._messageId;
    const names = Object.keys(toolStubs);
    const stubCode = names.map(n => `async function ${n}(args){
      const callId = Math.random().toString(36).slice(2);
      parent.postMessage({type:'tool_call',id:${id},callId,tool:${JSON.stringify(n)},args},'*');
      return new Promise((resolve,reject)=>{(window.__pending=window.__pending||{})[callId]={resolve,reject};});
    }`).join('\n');
    const wrappedCode = `<script>
      window.addEventListener('message',(e)=>{
        if(e.data.type==='tool_result'&&window.__pending?.[e.data.callId]){
          window.__pending[e.data.callId].resolve(e.data.result);
          delete window.__pending[e.data.callId];
        }
      });
      ${stubCode}
      (async()=>{
        try{
          const __fn=new Function(${JSON.stringify(names.join(','))},'return (async()=>{'+${JSON.stringify(code)}+'})()');
          const result=await __fn(${names.join(',')});
          parent.postMessage({type:'result',id:${id},result},'*');
        }catch(err){parent.postMessage({type:'error',id:${id},error:err.message},'*');}
      })();
    <\/script>`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        delete this._pending[id];
        this.destroy();
        reject(new Error(`Sandbox execution timed out (${this.timeout}ms)`));
      }, this.timeout);
      this._pending[id] = {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
        toolStubs
      };
      this._iframe.srcdoc = wrappedCode;
    });
  }

  _onMessage({ data }) {
    if (!data?.id) return;
    const pending = this._pending[data.id];
    if (data.type === 'tool_call') {
      const fn = pending?.toolStubs[data.tool];
      if (!fn) return;
      Promise.resolve().then(() => fn(data.args))
        .then(result => result, err => `Error: ${err.message}`)
        .then(result => this._iframe?.contentWindow?.postMessage(
          { type: 'tool_result', callId: data.callId, result }, '*'
        ));
    } else if (data.type === 'result') {
      pending?.resolve(data.result);
      delete this._pending[data.id];
    } else if (data.type === 'error') {
      pending?.reject(new Error(data.error));
      delete this._pending[data.id];
    }
  }
}
