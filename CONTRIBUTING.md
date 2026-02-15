---
title: Contributing
---

# Contributing

Signal K server is an Open Source project and contributions are welcome.

Contributions are made by creating Pull Requests in the [GitHub repository](https://github.com/SignalK/signalk-server).

_**Working on your first Pull Request?**_

You can learn how from this _free_ series [How to Contribute to an Open Source Project on GitHub](https://egghead.io/series/how-to-contribute-to-an-open-source-project-on-github)

---

### Additional Guidelines

The [AGENTS.md](AGENTS.md) file contains detailed coding guidelines primarily intended for AI coding assistants. The content is equally relevant for human contributors - it covers code quality principles, commit conventions, and PR guidelines that help maintain consistency across the project.

Don't worry if some of the instructions seem overly specific or prescriptive - they're written to give AI tools explicit guardrails. As a human, use your judgment; the spirit of the guidelines matters more than following every detail to the letter.

---

### Running the development server

1. Clone the repository:

   ```shell
   git clone https://github.com/SignalK/signalk-server
   cd signalk-server
   ```

1. Install dependencies:

   ```shell
   npm install
   ```

1. Build the server and related packages:

   ```shell
   npm run build:all
   ```

1. Start the server:
   ```shell
   npm start
   ```

The server should now be available at [http://localhost:3000](http://localhost:3000).

As you work on your changes, you may need to re-build changes. To continuously watch for changes, open a new terminal and run `npm run watch` in either the project root, or from the relevant directory in `packages/*`.

You may also need to restart the server to see some changes reflected.

### Using sample data

Start the server with sample data by running:

- NMEA0183 sample data: `bin/nmea-from-file`
- NMEA2000 sample data: `bin/n2k-from-file`

This will start the server with a sample configuration file and the server will start playing back data from a sample file under `samples/`. The data is available immediately via the REST interface at https://localhost:3000/signalk/v1/api/ and via WebSocket, for example with

```
npm install -g wscat2
wscat 'ws://localhost:3000/signalk/v1/stream?subscribe=all'
```

### Submitting a Pull Request (PR)

Before you submit your Pull Request (PR) consider the following guidelines:

1. [Fork](https://help.github.com/articles/fork-a-repo/) the repository.
1. Make your changes in a new git branch:
   - `git checkout -b my-fix-branch master`
   - Do not change the server or package version numbers. They will be changed by the maintainers after the PR is merged, when a new version is published
   - Create separate PRs for separate things - don't cram unrelated things to one PR, even if you have done them together. If you put multiple changes in one PR and one gets stalled or rejected we could still possibly merge the other one. If changes in one depend on the other one state that in PR description. You can think in terms of release notes: if the changes would be two entries in the changelog they should be separate PRs.
1. Commit your changes using a descriptive commit message that follows the
   [conventions outlined here](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits). Whilst we are not 100% strict about this, it really helps when reviewing the PR and in making the commit history readable. The TL;DR of it is below.
   - The subject line should be in the format `<type>: <subject>`, where `<type>` should be one of:
     - feat (feature)
     - fix (bug fix)
     - docs (documentation)
     - style (formatting, missing semi colons, ...)
     - refactor
     - test (when adding missing tests)
     - chore (maintain)
   - `<subject>` should use imperative, present tense: "change" not "changed" or "changes"
   - Examples of good Subject Lines:
     - `doc: clarify meta.units behaviour`
     - `chore: update keyswithmetadata.json`
     - `style: prettier`
     - `fix: allow nextPoint to be an intermediate leaf`
     - `feature: push design object fields under value/values`
   - Message body should also be **in imperative, present tense** and **include motivation for the change** and **differences to previous behaviour**.
   - Footer should reference any issues. If the PR should close issue(s) (assuming it is committed), **use closes,fixes or resolves** and the issue number. eg. "closes #18", "fixes #21 and resolves #23".
   - Subject, Body and Footer are separated by a blank line.

1. Format and lint your code
   - run `npm run format` to format and [lint](<https://en.wikipedia.org/wiki/Lint_(software)>) your code.

1. Push your branch to GitHub:
   - `git push origin my-fix-branch`

1. In GitHub, create a pull request.
   - Use the same guidelines as commit messages to write the PR title and description.
   - The server's release notes are automatically generated from PR titles, so think about how you can make them **descriptive, informative and easy to understand**. Ask yourself: "If I only knew the title would I understand what the PR does?".
   - The description should tell how the change affects the server's behavior and motivation for doing the change.
   - If you change the Admin UI include screenshots in the description to help others get a quick idea what changes and how it will look. Before & after pictures are great for this.
   - If you are using AI **PLEASE TAKE THE TIME to make the PR description succinct and straight to the point**. AIs are really good at creating text, filling in lots of details and adding smug comments how great the PR is. HELP the maintainers so that we don't need to wade through AI fluff. We will ask for more details if too little are included.
   - Don't include too much detail, like the exact changed lines or a version you tested the change with unless there is specific reason to do so. If the change is not directly related to a version adding a version is misleading. Git shows what's changed and extra content in PR description is just double work for maintainers to read, unless there is something that rquires attention.

1. Wait for labeling and review
   - The maintainers will apply a label to the PR. The label is used to group PRs, mainly to distinguish fixes and new features.
   - If we require changes to your PR we expect you to:
   - Implement the agreed changes.
   - Rebase your branch and force push to your GitHub repository (this will update your Pull Request):

     ```shell
     git rebase master -i
     git push -f
     ```
