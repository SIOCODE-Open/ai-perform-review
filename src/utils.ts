import { Minimatch } from 'minimatch';
import fs from 'fs';
import path from 'path';

export function matchGlobs(filePath: string, patterns?: string[]): boolean {
  if (!patterns?.length) return false;
  return patterns.some((p) => new Minimatch(p, { dot: true }).match(filePath));
}

export function loadAiIgnore(repoDir: string): string[] {
  const p = path.join(repoDir, '.aiignore');
  return fs.existsSync(p)
    ? fs.readFileSync(p, 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [];
}
