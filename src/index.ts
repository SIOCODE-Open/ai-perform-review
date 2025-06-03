#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { ReviewEngine } from './reviewEngine.js';

const cli = new Command();

cli
  .name('mr-checker')
  .description('Automatic merge-request checker bot CLI')
  .argument('<remoteName>', 'Git remote (e.g. origin)')
  .argument('<baseBranch>', 'Base branch to compare against')
  .argument('<branch>', 'Branch to review')
  .option('-d, --dir <path>', 'Repository directory', process.cwd())
  .option('--history-system-prompt <file>', 'System prompt for history-rules')
  .option('--file-system-prompt <file>', 'System prompt for file-rules')
  .option('--inline-system-prompt <file>', 'System prompt for inline-rules')
  .parse(process.argv);

const opts = cli.opts<{
  dir: string;
  historySystemPrompt?: string;
  fileSystemPrompt?: string;
  inlineSystemPrompt?: string;
}>();

const [remote, base, branch] = cli.args;

function readPrompt(p?: string): string | undefined {
  if (!p) return;
  const f = path.resolve(p);
  if (!fs.existsSync(f)) {
    console.error(`Prompt file not found: ${f}`);
    process.exit(2);
  }
  return fs.readFileSync(f, 'utf-8');
}

(async () => {
  try {
    await new ReviewEngine(
      path.resolve(opts.dir),
      remote,
      base,
      branch,
      {
        history: readPrompt(opts.historySystemPrompt),
        file: readPrompt(opts.fileSystemPrompt),
        inline: readPrompt(opts.inlineSystemPrompt)
      }
    ).run();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(2);
  }
})();
