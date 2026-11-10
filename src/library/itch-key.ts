import { Database } from 'bun:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** where the itch desktop app keeps its butler database */
export function butlerCandidates(): string[] {
  const home = os.homedir();
  const appData = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  const candidates = [
    path.join(home, '.config', 'itch', 'db', 'butler.db'),
    path.join(appData, 'itch', 'db', 'butler.db'),
    path.join(localAppData, 'itch', 'db', 'butler.db'),
    path.join(home, 'Library', 'Application Support', 'itch', 'db', 'butler.db'),
  ];
  return [...new Set(candidates)].filter((file) => {
    try {
      return fs.existsSync(file);
    } catch {
      return false;
    }
  });
}

/**
 * Read the account API key the itch app already stores.
 * The live DB is copied first so we never take a lock on the running app.
 */
export function readItchApiKey(): string | null {
  for (const source of butlerCandidates()) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-butler-'));
    const copy = path.join(tmpDir, 'butler.db');
    try {
      fs.copyFileSync(source, copy);
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(source + suffix)) fs.copyFileSync(source + suffix, copy + suffix);
      }
      const db = new Database(copy, { readonly: true });
      const row = db.query('select api_key from profiles limit 1').get() as { api_key?: string } | null;
      db.close();
      if (row?.api_key) return row.api_key;
    } catch {
      /* try the next location */
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
  return null;
}

export function itchAppDetected(): boolean {
  return butlerCandidates().length > 0;
}
