import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from '../src/events.js';

test('EventEmitter: on registers a listener and emit invokes it with data', () => {
  const ee = new EventEmitter();
  let received;
  ee.on('greet', (data) => { received = data; });
  ee.emit('greet', { msg: 'hi' });
  assert.deepEqual(received, { msg: 'hi' });
});

test('EventEmitter: emit invokes multiple listeners in registration order', () => {
  const ee = new EventEmitter();
  const calls = [];
  ee.on('e', () => calls.push('a'));
  ee.on('e', () => calls.push('b'));
  ee.on('e', () => calls.push('c'));
  ee.emit('e');
  assert.deepEqual(calls, ['a', 'b', 'c']);
});

test('EventEmitter: off removes a previously-registered listener', () => {
  const ee = new EventEmitter();
  let count = 0;
  const fn = () => { count++; };
  ee.on('tick', fn);
  ee.emit('tick');
  ee.off('tick', fn);
  ee.emit('tick');
  assert.equal(count, 1);
});

test('EventEmitter: emit on an event with no listeners is a no-op', () => {
  const ee = new EventEmitter();
  assert.doesNotThrow(() => ee.emit('never-registered', { x: 1 }));
});

test('EventEmitter: on and off return this for chaining', () => {
  const ee = new EventEmitter();
  const fn = () => {};
  assert.equal(ee.on('x', fn), ee);
  assert.equal(ee.off('x', fn), ee);
});
