# AI Perform Review

AI-powered merge request review CLI.

## Building and Running

Install dependencies and compile:

```bash
pnpm install
pnpm run build
```

Run the CLI:

```bash
node lib/index.js <remote> <baseBranch> <branch> [options]
```

This command is also available via the `mr-checker` binary if `pnpm` installed it globally.

Environment variables `OPENAI_API_KEY` or `GEMINI_API_KEY` (or a credentials file at `~/.ai/review/credentials.json`) must be set to access the AI provider.

### Options

- `-d, --dir <path>`: Repository directory (defaults to the current working directory)
- `--history-system-prompt <file>`: System prompt for history scoped rules
- `--file-system-prompt <file>`: System prompt for file scoped rules
- `--inline-system-prompt <file>`: System prompt for inline scoped rules

### Docker

You can use the prebuilt Docker image from Docker Hub:

```bash
docker run --rm -v "$PWD:/repo" -w /repo siocode/ai-peform-review mr-checker <remote> <baseBranch> <branch>
```

## Defining Rules

Rules are YAML or JSON files placed inside a `.ai` directory in your repository. Each rule has the following shape:

```yaml
id: example-rule
scope: file | history | inline
severity: low | medium | high
statement: "Description of the rule"  # what the rule checks
exceptions: |
  Optional text describing exceptions
include:
  - "glob/**"           # files to include
exclude:
  - "other/**"          # files to exclude
matchInclude:
  - "REGEX"            # only check lines matching this regex
matchExclude:
  - "REGEX"            # skip lines matching this regex
```

Use `include`/`exclude` to control which files the rule runs against. `matchInclude` and `matchExclude` restrict evaluation to specific line patterns for inline checks.

## Examples

Several ready-made rule definitions are provided in the [`examples/`](examples/) folder:

- **no-console.review.rule.yaml** – flags usage of `console` statements
- **no-todo.review.rule.yaml** – warns about TODO comments left in the code
- **commit-message-style.review.rule.yaml** – checks commit messages for length and formatting
- **large-function.review.rule.yaml** – detects functions with more than 50 lines
- **test-file-name.review.rule.yaml** – ensures test files follow `*.spec.ts` naming

Copy any of these files into your project's `.ai` directory to enable them.
