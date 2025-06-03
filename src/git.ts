import { execSync } from 'child_process';
import { CommitMeta, FileDiff } from './types.js';

function git(dir: string, args: string): string {
  return execSync(`git ${args}`, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString('utf-8');
}

export function fetchRemote(dir: string, remote: string): void {
  git(dir, `fetch ${remote}`);
}

export function getCommits(
  dir: string,
  remote: string,
  base: string,
  branch: string
): CommitMeta[] {
  const raw = git(dir, `log --pretty="format:%H|%at|%s" ${remote}/${base}..${branch}`);
  if (!raw.trim()) return [];
  return raw.split('\n').map((l) => {
    const [h, ts, msg] = l.split('|');
    return { hash: h, timestamp: +ts * 1000, message: msg };
  });
}

export function getChangedFiles(
  dir: string,
  remote: string,
  base: string,
  branch: string
): FileDiff[] {
  const raw = git(dir, `diff --name-status --numstat ${remote}/${base}...${branch}`);
  return raw
    .split('\n')
    .filter(Boolean)
    .map<FileDiff>((l) => {
      const numstat = l.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
      if (numstat) {
        const [, a, d, f] = numstat;
        return {
          filePath: f,
          status: 'M',
          additions: a === '-' ? 0 : +a,
          deletions: d === '-' ? 0 : +d
        };
      }
      const [status, file] = l.split('\t');
      return { filePath: file, status: status as any, additions: 0, deletions: 0 };
    });
}

export function getFileDiff(
  dir: string,
  remote: string,
  base: string,
  branch: string,
  filePath: string
): string {
  return git(dir, `diff ${remote}/${base}...${branch} -- ${filePath}`);
}
