/** Saves raw pages that could not be parsed, for debugging. */

import fs from 'node:fs/promises';
import path from 'node:path';

/** Writes one page into `dir` and returns the file path. */
export async function writeDump(dir: string, name: string, body: string, now = Date.now()): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name.replace(/[^\w.-]+/g, '-')}-${now}.html`);
  await fs.writeFile(file, body, 'utf8');
  return file;
}
