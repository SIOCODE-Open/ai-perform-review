import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { AIClient } from './aiClient.js';
import { fetchRemote, getCommits, getChangedFiles, getFileDiff } from './git.js';
import { loadRules } from './ruleLoader.js';
import { Issue, Rule, Severity } from './types.js';
import { loadAiIgnore, matchGlobs } from './utils.js';

interface Prompts {
  history?: string;
  file?: string;
  inline?: string;
}

export class ReviewEngine {
  constructor(
    private repoDir: string,
    private remote: string,
    private base: string,
    private branch: string,
    private prompts: Prompts
  ) {
    this.ai = new AIClient();
  }
  private ai: AIClient;

  async run(): Promise<Issue[]> {
    fetchRemote(this.repoDir, this.remote);

    const commits = getCommits(this.repoDir, this.remote, this.base, this.branch);
    const files = getChangedFiles(this.repoDir, this.remote, this.base, this.branch);
    const rules = loadRules(this.repoDir);
    const ignored = loadAiIgnore(this.repoDir);

    const issues: Issue[] = [];

    await Promise.all(
      rules
        .filter((r) => r.scope === 'history')
        .map((rule) =>
          this.evaluateRule(
            rule,
            commits
              .map(
                (c) =>
                  `commit ${c.hash}\ndate ${new Date(c.timestamp).toISOString()}\n${c.message}`
              )
              .join('\n'),
            this.prompts.history
          ).then((i) => i && issues.push(i))
        )
    );

    await Promise.all(
      files.map(async (f) => {
        const diff =
          matchGlobs(f.filePath, ignored) ||
          f.status === 'D'
            ? undefined
            : getFileDiff(this.repoDir, this.remote, this.base, this.branch, f.filePath);

        for (const rule of rules.filter((r) => r.scope === 'file')) {
          if (!this.applicable(rule, f.filePath, diff)) continue;
          const i = await this.evaluateRule(rule, diff ?? '', this.prompts.file, f.filePath);
          if (i) issues.push(i);
        }

        if (!diff) return;
        const lines = diff.split('\n');
        let n = 0;
        for (const line of lines) {
          n++;
          for (const rule of rules.filter((r) => r.scope === 'inline')) {
            if (!this.applicable(rule, f.filePath, line)) continue;
            const i = await this.evaluateRule(rule, line, this.prompts.inline, f.filePath, n);
            if (i) issues.push(i);
          }
        }
      })
    );

    const out = path.join(this.repoDir, '.ai-review.result.json');
    fs.writeFileSync(out, JSON.stringify(issues, null, 2));

    this.print(issues);
    process.exitCode = issues.some((i) => i.severity === 'high') ? 1 : 0;
    return issues;
  }

  private async evaluateRule(
    rule: Rule,
    content: string,
    systemPrompt = '',
    file?: string,
    line?: number
  ): Promise<Issue | null> {
    const prompt = `
Check the following content against this rule.

Rule:
${rule.statement}
${rule.exceptions ? `\nExceptions:\n${rule.exceptions}` : ''}

Content:
\`\`\`
${content}
\`\`\`

Respond with JSON:
{ "violation": true|false,${Array.isArray(rule.severity) ? ' "severity": "low|medium|high",' : ''} "message": "..." }
`.trim();

    const res = await this.ai.evaluate('openai', systemPrompt, prompt);
    if (!res.violation) return null;

    const sev: Severity =
      res.severity ??
      (Array.isArray(rule.severity) ? rule.severity[0] : (rule.severity as Severity));

    return { severity: sev, ruleId: rule.id, file, line, message: res.message ?? '' };
  }

  private applicable(rule: Rule, file: string, content?: string): boolean {
    if (rule.include && !matchGlobs(file, rule.include)) return false;
    if (rule.exclude && matchGlobs(file, rule.exclude)) return false;
    if (rule.matchInclude && content && !rule.matchInclude.some((r) => new RegExp(r).test(content)))
      return false;
    if (rule.matchExclude && content && rule.matchExclude.some((r) => new RegExp(r).test(content)))
      return false;
    return true;
  }

  private print(issues: Issue[]) {
    const groups: Record<Severity, Issue[]> = { high: [], medium: [], low: [] };
    for (const i of issues) groups[i.severity].push(i);

    const order: Severity[] = ['high', 'medium', 'low'];
    for (const s of order) {
      if (!groups[s].length) continue;
      const c = s === 'high' ? chalk.red : s === 'medium' ? chalk.yellow : chalk.gray;
      console.log(c.bold(`\n${s.toUpperCase()} severity issues:`));
      for (const i of groups[s]) {
        const loc = i.file ? `${i.file}${i.line ? ':' + i.line : ''}` : 'repository';
        console.log(c(`• [${i.ruleId}] ${loc} – ${i.message}`));
      }
    }
    if (!issues.length) console.log(chalk.green.bold('\n✔ No issues found.'));
  }
}
