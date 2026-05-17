export class EventEmitter {
  _listeners = {};
  on(event, fn) { (this._listeners[event] ??= []).push(fn); return this; }
  off(event, fn) { const l = this._listeners[event]; if (l) this._listeners[event] = l.filter(f => f !== fn); return this; }
  emit(event, data) { for (const fn of this._listeners[event] ?? []) fn(data); }
}
