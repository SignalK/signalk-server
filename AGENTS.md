# Signal K Server

Signal K Server is the reference implementation of a [Signal K](https://signalk.org/) server. Signal K is a modern, open data format and API for marine data. The server aggregates data from various sources (NMEA 0183, NMEA 2000, I2C sensors, etc.), provides a real-time WebSocket API and REST API, and supports a plugin architecture for extensibility.

Key components:

- **Core server**: Express-based HTTP/WebSocket server (TypeScript)
- **Plugin system**: NPM-based plugins with configuration schemas
- **Admin UI**: React-based web interface (packages/server-admin-ui)
- **Provider patterns**: ResourceProvider, WeatherProvider, AutopilotProvider, HistoryProvider

## Code Quality Principles

### Scope and Complexity

Follow YAGNI, SOLID, DRY, and KISS principles. Avoid over-engineering. Only make changes that are directly requested or clearly necessary. Keep solutions simple and focused.

Do not add features, refactor code, or make "improvements" beyond what was asked. A bug fix does not need surrounding code cleaned up. A simple feature does not need extra configurability.

Do not add error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal code and framework guarantees. Only validate at system boundaries (user input, external APIs).

### General Standards

- Write self-documenting code; comments explain "why", not "what" - no echo comments restating what the code already says
- Keep functions small and focused on a single responsibility
- Prefer composition over inheritance
- Handle errors explicitly at system boundaries
- No magic numbers; use named constants
- Documentation describes current state, not development history - avoid changelog-style language that will become stale

### Type Safety

- **All new code must be written in TypeScript**, not JavaScript
- Use strict type checking; avoid `any` or equivalent escape hatches
- Validate external inputs at system boundaries
- Prefer immutable data structures where practical

### Testing

- All new code requires tests
- Test behavior, not implementation details
- Unit tests for business logic; integration tests for boundaries
- Aim for meaningful coverage, not arbitrary percentages

## Git Commit Conventions

Use conventional format: `<type>(<scope>): <subject>` where type = feat|fix|docs|style|refactor|test|chore|perf. Subject: 50 chars max, imperative mood ("add" not "added"), no period. For small changes: one-line commit only. For complex changes: add body explaining what/why (72-char lines) and reference issues.

Keep commits small and atomic - one logical change per commit. Split unrelated changes into separate commits. The commit history tells a story; each commit should be a meaningful, self-contained step.

**MANDATORY:** Always rebase and clean up commit history before creating a PR or pushing changes. Amend fixes and corrections to the relevant existing commit instead of creating chains of "fix typo" or "oops" commits. The final history should contain only intentional, complete commits - no work-in-progress artifacts.

## Pull Request Guidelines

Before opening a PR:

- Branch from latest `master`
- Run `npm run format` and `npm test` - all checks must pass
- Rebase and clean up commit history (squash intermediate commits)
- Self-review your changes
- **NEVER change version numbers** - maintainers will update versions when publishing releases

PR titles are used to generate release notes. Make them **descriptive, informative, and easy to understand**. Ask yourself: "If someone only read the title, would they understand what this PR does?"

PR descriptions must be **succinct and straight to the point**. Explain the motivation (why) and summarize the solution approach (how), but not the mechanics (what) - the diff shows what changed. Do not pad descriptions with unnecessary detail, verbose explanations, or self-congratulatory comments. If there are breaking changes, mention them explicitly. If a PR description includes a test plan with checkboxes, **all items must be checked** before the PR is ready for review - remove or complete any unchecked items.

When referencing issues, use `closes`, `fixes`, or `resolves` followed by the issue number (e.g., "closes #18", "fixes #21 and resolves #23").

**MANDATORY:** One logical change per PR. Refactoring and behavior changes belong in separate PRs. If changes would result in multiple changelog entries, they should be separate PRs. Even if you have made multiple changes together locally, split them into separate PRs.

**AI tools must proactively enforce PR scope.** If a user requests changes unrelated to the current PR topic, do not silently include them. Instead, suggest creating a separate PR for the unrelated work. Similarly, when rebasing or cleaning up commit history, if you detect commits that address different topics, suggest splitting them into separate PRs before proceeding.

When updating a branch with upstream changes, **always use rebase, never merge commits**:

```shell
git fetch origin
git rebase origin/master
```
