import { describe, expect, test } from 'bun:test';
import { dispatch, type Handler } from '../src/rpc';

const handlers = new Map<string, Handler>([
  ['echo', (params) => params],
  ['boom', () => {
    throw new Error('kaboom');
  }],
]);

describe('dispatch', () => {
  test('returns the handler result with the request id', async () => {
    const reply = await dispatch({ jsonrpc: '2.0', id: 7, method: 'echo', params: { a: 1 } }, handlers);
    expect(reply).toEqual({ jsonrpc: '2.0', id: 7, result: { a: 1 } });
  });

  test('a missing result becomes null', async () => {
    const reply = await dispatch({ id: 1, method: 'echo' }, handlers);
    expect(reply).toEqual({ jsonrpc: '2.0', id: 1, result: null });
  });

  test('notifications get no reply', async () => {
    expect(await dispatch({ method: 'echo', params: 1 }, handlers)).toBeNull();
    expect(await dispatch({ method: 'missing' }, handlers)).toBeNull();
  });

  test('unknown method is an error reply', async () => {
    const reply = await dispatch({ id: 2, method: 'nope' }, handlers);
    expect(reply).toEqual({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32601, message: 'method not found: nope' },
    });
  });

  test('a throwing handler becomes an error reply', async () => {
    const reply = await dispatch({ id: 3, method: 'boom' }, handlers);
    expect(reply).toEqual({ jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'kaboom' } });
  });

  test('a non-request is an invalid request', async () => {
    const reply = await dispatch('hello', handlers);
    expect(reply).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'invalid request' },
    });
  });
});
