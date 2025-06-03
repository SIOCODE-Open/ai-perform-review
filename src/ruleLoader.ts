import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import crypto from 'crypto';
import { Rule } from './types.js';

export function loadRules(repoDir: string): Rule[] {
  const dir = path.join(repoDir, '.ai');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];

  const files = fs.readdirSync(dir).filter((f) => /.review\.rule\.(yml|yaml|json)$/i.test(f));
  const rules: Rule[] = [];

  for (const file of files) {
    const full = path.join(dir, file);
    const raw = fs.readFileSync(full, 'utf-8');
    const data = /json$/i.test(file) ? JSON.parse(raw) : yaml.parse(raw);
    for (const [idx, r] of (Array.isArray(data) ? data : [data]).entries()) {
      rules.push({
        id:
          r.id ??
          crypto.createHash('sha1').update(`${file}:${idx}`).digest('hex').slice(0, 10),
        scope: r.scope,
        severity: r.severity,
        statement: r.statement,
        exceptions: r.exceptions,
        include: r.include,
        exclude: r.exclude,
        matchInclude: r.matchInclude,
        matchExclude: r.matchExclude
      });
    }
  }
  return rules;
}
