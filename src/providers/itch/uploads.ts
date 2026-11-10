/**
 * Pure ranking helpers for itch.io uploads.
 *
 * Hard-won rules from the reference installer:
 *  - `position` is OLDEST-FIRST, so it must never decide which build is newest.
 *    `created_at` is the only trustworthy freshness signal.
 *  - a build is a demo when the `demo` trait is present OR the filename says so.
 *  - platform comes from `p_windows` / `p_linux` / `p_osx` (mac) traits.
 */

export type UploadPlatform = 'windows' | 'linux' | 'mac' | 'other';

export interface ItchUpload {
  id: number;
  filename: string;
  size?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  traits?: string[] | null;
  storage?: string | null;
  type?: string | null;
  /** itch sends this oldest-first; kept only so tests can prove it is ignored */
  position?: number | null;
  [key: string]: unknown;
}

export interface ChooseUploadsOptions {
  /** put demo builds first instead of full builds */
  demosFirst?: boolean;
}

function createdMs(upload: ItchUpload): number {
  const ms = Date.parse(upload.created_at ?? '');
  return Number.isFinite(ms) ? ms : 0;
}

function traitsOf(upload: ItchUpload): string[] {
  return Array.isArray(upload.traits) ? upload.traits.filter((t): t is string => typeof t === 'string') : [];
}

/** newest upload by `created_at`; `position` is deliberately never consulted */
export function pickNewest(uploads: readonly ItchUpload[]): ItchUpload | null {
  let best: ItchUpload | null = null;
  for (const upload of uploads) {
    if (!best) {
      best = upload;
      continue;
    }
    const a = createdMs(upload);
    const b = createdMs(best);
    // id is a deterministic tie-breaker for identical timestamps
    if (a > b || (a === b && upload.id > best.id)) best = upload;
  }
  return best;
}

/** demo either by trait or by filename (the API is inconsistent about the trait) */
export function isDemo(upload: ItchUpload): boolean {
  if (traitsOf(upload).includes('demo')) return true;
  return /demo/i.test(upload.filename ?? '');
}

export function preferPlatform(upload: ItchUpload): UploadPlatform {
  const traits = new Set(traitsOf(upload));
  if (traits.has('p_windows')) return 'windows';
  if (traits.has('p_linux')) return 'linux';
  if (traits.has('p_osx') || traits.has('p_mac')) return 'mac';
  return 'other';
}

/**
 * Order every upload for display: full builds above demos, newest first,
 * otherwise the input order is preserved. Never sorted by `position`.
 */
export function chooseUploads(
  uploads: readonly ItchUpload[],
  opts: ChooseUploadsOptions = {},
): ItchUpload[] {
  const demosFirst = opts.demosFirst === true;
  const demoRank = (upload: ItchUpload) => (isDemo(upload) === demosFirst ? 0 : 1);
  return uploads
    .map((upload, index) => ({ upload, index }))
    .sort((a, b) => {
      const demoA = demoRank(a.upload);
      const demoB = demoRank(b.upload);
      if (demoA !== demoB) return demoA - demoB;
      const timeDiff = createdMs(b.upload) - createdMs(a.upload);
      if (timeDiff !== 0) return timeDiff;
      if (a.upload.id !== b.upload.id) return b.upload.id - a.upload.id;
      return a.index - b.index;
    })
    .map((entry) => entry.upload);
}

/** first `v?1.2.3` in the filename, else the ISO date of the upload */
export function versionFromUpload(upload: ItchUpload): string | null {
  const match = (upload.filename ?? '').match(/v?(\d+(?:\.\d+)+)/i);
  if (match) return match[1];
  const ms = Date.parse(upload.created_at ?? '');
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}
