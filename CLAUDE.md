# CLAUDE.md

Project-specific instructions for Claude Code.

## Project

Web application project. Currently in early stages.

## Workflow Preferences

- **Ask before big changes**: Confirm before making large, structural, or destructive code changes
- **Short responses**: Keep explanations concise; prefer code over prose
- **Run tests**: Run the test suite after making changes (when tests exist)
- **No auto-commit**: Never commit code without an explicit instruction to do so

## Code Style

- Follow existing conventions in the codebase
- Prefer editing existing files over creating new ones
- Don't add unnecessary comments, docstrings, or abstractions
- Keep changes focused and minimal — don't refactor beyond what's asked

## Git

- Never force-push to `main`
- Never amend commits unless explicitly asked
- Use clear, descriptive commit messages
