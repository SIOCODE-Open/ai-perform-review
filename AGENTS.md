# Repository Guide

This project implements an AI-powered merge request review CLI written in TypeScript.

## Structure
- `src/` contains TypeScript sources.
  - `index.ts` – CLI entry point (command `mr-checker`).
  - `reviewEngine.ts` – runs the review process.
  - `aiClient.ts` – connects to OpenAI/Gemini providers.
  - `git.ts` – Git utilities (fetch, diff, etc.).
  - `ruleLoader.ts`, `utils.ts`, `types.ts` – helper modules.
- `.ai/` holds review rule definitions.
- `.aiignore` may list patterns to skip during review.
- Build output goes to `lib/`.

## Building
1. Install dependencies with `pnpm install`.
2. Compile using `pnpm run build` (runs `tsc`).

The generated CLI is `lib/index.js`.

## Running
```
node lib/index.js <remote> <baseBranch> <branch> [options]
```
Environment variables `OPENAI_API_KEY` or `GEMINI_API_KEY` (or a credentials file in `~/.ai/review/credentials.json`) must be provided for AI access.

## Notes
- There are currently no automated tests.
- Example review rules are provided in `.ai` (e.g. `a17.review.rule.yaml`).
