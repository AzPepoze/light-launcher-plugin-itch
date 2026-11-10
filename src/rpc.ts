/**
 * Newline-delimited JSON-RPC 2.0 over stdin and stdout.
 * stdout carries only protocol lines; logs go to stderr.
 */

import { createInterface } from 'node:readline';

export type Handler = (params: unknown) => unknown;
export type Handlers = ReadonlyMap<string, Handler>;

export const SHUTDOWN_METHOD = 'shutdown';

const ERROR_CODE = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  handler: -32000,
} as const;

interface Request {
  id?: string | number | null;
  method: string;
  params?: unknown;
}

interface ErrorReply {
  jsonrpc: '2.0';
  id: string | number | null;
  error: { code: number; message: string };
}

interface ResultReply {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

type Reply = ErrorReply | ResultReply;

function errorReply(id: string | number | null, code: number, message: string): ErrorReply {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRequest(value: unknown): value is Request {
  return typeof value === 'object' && value !== null && typeof (value as Request).method === 'string';
}

/** runs one parsed request; returns the reply, or null for notifications (no `id`) */
export async function dispatch(message: unknown, handlers: Handlers): Promise<Reply | null> {
  if (!isRequest(message)) return errorReply(null, ERROR_CODE.invalidRequest, 'invalid request');
  const isNotification = !('id' in message);
  const id = message.id ?? null;

  const handler = handlers.get(message.method);
  if (!handler) {
    return isNotification
      ? null
      : errorReply(id, ERROR_CODE.methodNotFound, `method not found: ${message.method}`);
  }

  try {
    const result = await handler(message.params);
    return isNotification ? null : { jsonrpc: '2.0', id, result: result ?? null };
  } catch (err) {
    return isNotification ? null : errorReply(id, ERROR_CODE.handler, errorMessage(err));
  }
}

function write(message: object): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`${JSON.stringify(message)}\n`, () => resolve());
  });
}

function isShutdown(message: unknown): boolean {
  return isRequest(message) && message.method === SHUTDOWN_METHOD;
}

async function handleLine(line: string, handlers: Handlers): Promise<void> {
  if (!line.trim()) return;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    await write(errorReply(null, ERROR_CODE.parse, 'parse error'));
    return;
  }
  const reply = await dispatch(message, handlers);
  if (reply) await write(reply);
  if (isShutdown(message)) process.exit(0);
}

/** serves requests from stdin until the host closes the pipe or sends `shutdown` */
export function serve(handlers: Handlers): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on('line', (line) => {
    void handleLine(line, handlers);
  });
  lines.on('close', () => process.exit(0));
}
