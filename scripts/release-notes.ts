/** Turns Conventional Commit subjects into release notes sections. */

const SECTIONS = [
  ['feat', 'Features'],
  ['fix', 'Fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['docs', 'Documentation'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['test', 'Tests'],
  ['style', 'Style'],
] as const;

// Everything else, including chore commits, goes under "Other changes".

const TITLES = new Map<string, string>(SECTIONS);
const COMMIT = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

interface Commit {
  type: string;
  scope?: string;
  subject: string;
  breaking: boolean;
}

function parseCommit(line: string): Commit | undefined {
  const match = COMMIT.exec(line);
  if (!match) return undefined;
  return { type: match[1], scope: match[2], subject: match[4], breaking: match[3] === '!' };
}

function format(commit: Commit): string {
  return commit.scope ? `- **${commit.scope}:** ${commit.subject}` : `- ${commit.subject}`;
}

/** One section per commit type, then breaking changes and unconforming subjects. */
export function renderReleaseNotes(subjects: string[]): string {
  const grouped = new Map<string, string[]>();
  const other: string[] = [];
  const breaking: string[] = [];

  for (const subject of subjects) {
    const commit = parseCommit(subject);
    if (!commit) {
      other.push(`- ${subject}`);
      continue;
    }
    const title = TITLES.get(commit.type);
    if (!title) {
      other.push(format(commit));
      continue;
    }
    const lines = grouped.get(title) ?? [];
    lines.push(format(commit));
    grouped.set(title, lines);
    if (commit.breaking) breaking.push(format(commit));
  }

  const blocks: string[] = [];
  for (const [, title] of SECTIONS) {
    const lines = grouped.get(title);
    if (lines?.length) blocks.push(`## ${title}\n\n${lines.join('\n')}`);
  }
  if (other.length) blocks.push(`## Other changes\n\n${other.join('\n')}`);
  if (breaking.length) blocks.push(`## Breaking changes\n\n${breaking.join('\n')}`);

  return blocks.length ? `${blocks.join('\n\n')}\n` : 'No changes.\n';
}

if (import.meta.main) {
  const input = await Bun.stdin.text();
  const subjects = input.split('\n').map((line) => line.trim()).filter(Boolean);
  process.stdout.write(renderReleaseNotes(subjects));
}
