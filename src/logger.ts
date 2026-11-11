/**
 * Logger for stderr. stdout carries the JSON-RPC stream, so logs never go there.
 */

import type { LogLevel } from './host';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const PASTEL_SATURATION = 0.6;
const PASTEL_LIGHTNESS = 0.8;

const LEVEL_STYLE: Record<LogLevel, { label: string; code: string }> = {
  debug: { label: 'DEBUG', code: '\x1b[90m' },
  info: { label: 'INFO ', code: '\x1b[32m' },
  warn: { label: 'WARN ', code: '\x1b[33m' },
  error: { label: 'ERROR', code: '\x1b[31m' },
};

const useColor = Boolean(process.stderr.isTTY) && !process.env.NO_COLOR;

/** FNV-1a 32-bit hash; stable across runs, unlike a seeded or random hash */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** pastel colour for a category: the hash picks the hue, saturation and lightness are fixed */
export function categoryRgb(category: string): [number, number, number] {
  return hslToRgb(fnv1a(category) % 360, PASTEL_SATURATION, PASTEL_LIGHTNESS);
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const sectors: [number, number, number][] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const [r, g, b] = sectors[Math.floor(hue / 60)];
  return [r, g, b].map((channel) => Math.round((channel + offset) * 255)) as [number, number, number];
}

function paint(text: string, code: string): string {
  return useColor ? `${code}${text}${RESET}` : text;
}

function categoryCode(category: string): string {
  const [r, g, b] = categoryRgb(category);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function formatExtra(extra: unknown): string {
  if (extra === undefined) return '';
  if (extra instanceof Error) return ` ${extra.message}`;
  if (typeof extra === 'string') return ` ${extra}`;
  try {
    return ` ${JSON.stringify(extra)}`;
  } catch {
    return ` ${String(extra)}`;
  }
}

let verbose = false;

/** Debug lines are written only when verbose logging is on. */
export function setVerboseLogging(on: boolean): void {
  verbose = on;
}

function isShown(level: LogLevel): boolean {
  return level !== 'debug' || verbose;
}

/** writes one line per call, so concurrent requests never interleave */
export function writeLog(
  category: string,
  level: LogLevel,
  message: string,
  extra?: unknown,
): void {
  if (!isShown(level)) return;
  const style = LEVEL_STYLE[level];
  const time = paint(new Date().toISOString(), DIM);
  const label = paint(style.label, style.code);
  const tag = paint(`[${category}]`, categoryCode(category));
  process.stderr.write(`${time} ${label} ${tag} ${message}${formatExtra(extra)}\n`);
}
