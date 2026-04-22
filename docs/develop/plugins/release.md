---
title: Releases and Changelogs
---

# Releases and Changelogs for Plugins

When a user updates a plugin through the AppStore, they currently see only the new version number — nothing about what changed. This page describes a light-touch convention that makes per-release notes available to tools (a future AppStore, Dependabot, npm's package page) and to humans browsing your repository.

The recommendation is deliberately tool-agnostic. Pick whichever of the established approaches below fits your workflow; what matters is the **output shape**, not how you produce it.

## The contract

For each npm-published version of your plugin, aim to have:

1. A **GitHub Release** with a tag that matches the npm version (e.g. npm `1.4.2` ↔ git tag `v1.4.2` or `1.4.2`).
2. A human-readable **release body** in Markdown — a few lines is plenty.
3. _Optional:_ a `CHANGELOG.md` at the repo root following [Keep a Changelog](https://keepachangelog.com/).

Anything that produces that shape is fine. Downstream consumers read GitHub Releases via the public API, which is the same regardless of which tool produced the notes.

## Approach 1 — GitHub's built-in auto-generated notes (zero config)

The simplest path: let GitHub generate the release body from merged PRs. This is the same logic as the **Generate release notes** button in the GitHub web UI, triggered from a workflow on tag push. No third-party changelog action required.

The [example workflow](./examples/plugin-release-example.yml) uses this approach — tag push → create GitHub Release with auto-generated body → `npm publish --provenance`.

If you want to categorize entries by PR label (Features / Fixes / Other), add a [`.github/release.yml`](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes) to your repo. GitHub reads it automatically.

## Approach 2 — release-drafter

[release-drafter](https://github.com/release-drafter/release-drafter) accumulates a draft release across PR merges, so you can review and edit notes before tagging. Useful if you want a human pass over the wording.

## Approach 3 — release-please / semantic-release / changesets

[release-please](https://github.com/googleapis/release-please), [semantic-release](https://semantic-release.gitbook.io/), and [changesets](https://github.com/changesets/changesets) go further: they also drive **version bumps** from conventional commits or intent files, and maintain `CHANGELOG.md` automatically. More automation, more opinion — worth it for plugins that release frequently.

## Commit hygiene

Whichever approach you pick, the quality of the generated notes depends on your commit messages and PR titles. The [Signal K server contributing guide](https://github.com/SignalK/signalk-server/blob/master/CONTRIBUTING.md) already covers this — the same conventions apply to plugin repositories.

When using GitHub's built-in generator (Approach 1), **PR titles become the release-note lines**. Write titles that make sense out of context: "fix AIS fallback when GPS source is missing" beats "fix bug".

## npm publish and provenance

Publish from a GitHub Actions job triggered by the same tag push that creates the release. Use [npm provenance](https://docs.npmjs.com/generating-provenance-statements) so consumers can verify the package was built from the linked commit:

```yaml
permissions:
  id-token: write # required for provenance
  contents: read

steps:
  - run: npm publish --provenance --access public
```

The [example workflow](./examples/plugin-release-example.yml) shows the full shape, including a beta-tag branch for `*-beta*` versions.

If the publish step fails transiently after the GitHub Release was already created, re-run the failed `publish` job from the Actions UI. If that's not possible, cut a new patch tag (e.g. `v1.4.3`) rather than force-retagging — tags and releases should be immutable so downstream consumers of the GitHub Release can trust them.

## Dependabot

Dependabot fetches the GitHub Release notes of each updated package and embeds them into its update PRs — so plugins that follow the contract above already benefit their downstream users. Dependabot is also useful _for_ your plugin: it keeps the dependencies of your plugin (and the versions of the GitHub Actions your CI/release workflows use) up to date.

A minimal `.github/dependabot.yml` should cover two ecosystems:

- `npm` — your plugin's runtime dependencies
- `github-actions` — the versions of the actions your CI and release workflows use

Group non-breaking upgrades (minor + patch) into a single PR per ecosystem to cut down on noise; leave major-version bumps as their own PRs because they usually need a real look.

See [`examples/plugin-dependabot-example.yml`](./examples/plugin-dependabot-example.yml) for a copy-pasteable config with explanatory comments, and the [Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference) for the full set of tunables.

## See also

- [Continuous Integration for Plugins](./ci.md) — validate your plugin before releasing
- [Publishing to The AppStore](./publishing.md) — npm keywords and `package.json` shape
- [Keep a Changelog](https://keepachangelog.com/)
- [Semantic Versioning](https://semver.org/)
- [GitHub: Automatically generated release notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)
- [npm: Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements)
