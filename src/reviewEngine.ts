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
    console.log(chalk.blue.bold('\n🔍 Initializing AI Code Review'));
    console.log(chalk.blue(`Repository: ${this.repoDir}`));
    console.log(chalk.blue(`Branch: ${this.branch} (comparing against ${this.base})`));
  }
  private ai: AIClient;

  async run(): Promise<Issue[]> {
    console.log(chalk.cyan('\n📡 Fetching remote repository...'));
    fetchRemote(this.repoDir, this.remote);

    console.log(chalk.cyan('\n📥 Loading repository data...'));
    const commits = getCommits(this.repoDir, this.remote, this.base, this.branch);
    console.log(chalk.gray(`Found ${commits.length} commits to review`));
    
    const files = getChangedFiles(this.repoDir, this.remote, this.base, this.branch);
    console.log(chalk.gray(`Found ${files.length} changed files to review`));
    
    const rules = loadRules(this.repoDir);
    console.log(chalk.gray(`Loaded ${rules.length} rules for review`));
    
    const ignored = loadAiIgnore(this.repoDir);
    console.log(chalk.gray(`Loaded ${ignored.length} ignore patterns`));

    const issues: Issue[] = [];

    console.log(chalk.cyan('\n📜 Reviewing commit history...'));
    await Promise.all(
      rules
        .filter((r) => r.scope === 'history')
        .map((rule) => {
          console.log(chalk.gray(`Evaluating rule: ${rule.id}`));
          return this.evaluateRule(
            rule,
            commits
              .map(
                (c) =>
                  `commit ${c.hash}\ndate ${new Date(c.timestamp).toISOString()}\n${c.message}`
              )
              .join('\n'),
            this.prompts.history
          ).then((i) => i && issues.push(i))
        })
    );

    console.log(chalk.cyan('\n📁 Reviewing changed files...'));
    await Promise.all(
      files.map(async (f) => {
        console.log(chalk.gray(`\nAnalyzing file: ${f.filePath}`));
        const diff =
          matchGlobs(f.filePath, ignored) ||
          f.status === 'D'
            ? undefined
            : getFileDiff(this.repoDir, this.remote, this.base, this.branch, f.filePath);

        if (matchGlobs(f.filePath, ignored)) {
          console.log(chalk.gray(`Skipping ignored file: ${f.filePath}`));
          return;
        }

        if (f.status === 'D') {
          console.log(chalk.gray(`Skipping deleted file: ${f.filePath}`));
          return;
        }

        for (const rule of rules.filter((r) => r.scope === 'file')) {
          if (!this.applicable(rule, f.filePath, diff)) {
            console.log(chalk.gray(`Rule ${rule.id} not applicable to ${f.filePath}`));
            continue;
          }
          console.log(chalk.gray(`Evaluating file rule: ${rule.id}`));
          const i = await this.evaluateRule(rule, diff ?? '', this.prompts.file, f.filePath);
          if (i) issues.push(i);
        }

        if (!diff) return;
        console.log(chalk.gray(`Analyzing inline changes in ${f.filePath}`));
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

    console.log(chalk.cyan('\n💾 Saving review results...'));
    const out = path.join(this.repoDir, '.ai-review.result.json');
    fs.writeFileSync(out, JSON.stringify(issues, null, 2));
    console.log(chalk.gray(`Results saved to: ${out}`));

    console.log(chalk.cyan('\n📊 Review Summary:'));
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
    const locationStr = file ? (line ? `${file}:${line}` : file) : 'commit history';
    console.log(chalk.gray(`Evaluating rule ${rule.id} on ${locationStr}`));

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
    if (!res.violation) {
      console.log(chalk.gray(`✓ No violation found for rule ${rule.id}`));
      return null;
    }

    const sev: Severity =
      res.severity ??
      (Array.isArray(rule.severity) ? rule.severity[0] : (rule.severity as Severity));

    console.log(chalk.yellow(`⚠ Found ${sev} severity violation for rule ${rule.id}`));
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
    
    // Print final statistics
    console.log(chalk.blue.bold('\n📈 Review Statistics:'));
    console.log(chalk.blue(`Total issues: ${issues.length}`));
    console.log(chalk.red(`High severity: ${groups.high.length}`));
    console.log(chalk.yellow(`Medium severity: ${groups.medium.length}`));
    console.log(chalk.gray(`Low severity: ${groups.low.length}`));
  }
}
