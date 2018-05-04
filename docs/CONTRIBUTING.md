**Working on your first Pull Request?** You can learn how from this *free* series [How to Contribute to an Open Source Project on GitHub](https://egghead.io/series/how-to-contribute-to-an-open-source-project-on-github)

###  Submitting a Pull Request (PR)
Before you submit your Pull Request (PR) consider the following guidelines:

1. [Fork](https://help.github.com/articles/fork-a-repo/) the repo.
1. Make your changes in a new git branch:

     ```shell
     git checkout -b my-fix-branch master
     ```

1. Create your patch.
1. Commit your changes using a descriptive commit message that follows 
  [Angular commit message conventions](https://github.com/angular/angular.js/blob/master/DEVELOPERS.md#commits). We are not 100% strict about this, but it really helps when reviewing the PR and in making commit history readable. The TL;DR of it is below.
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
        - `chore: update keyswithmetadat.json`
        - `style: whitespace`
        - `fix: allow nextPoint to be an intermediate leaf`
        - `feature: push design object fields under value/values`
    - Message body should also be in imperative, present tense and **include motivation for the change** and **differences to previous behaviour**.
    - Footer should reference any issues. If the PR should close issue(s) (assuming it is committed), use closes/fixes or resolves and the issue number. eg. "closes #18", "fixes #21 and resolves #23".
    - Subject, Body and Footer are separated by a blank line.

1. Push your branch to GitHub:

    ```shell
    git push origin my-fix-branch
    ```

1. In GitHub, send a pull request to `signalk-server-node:master`.
* Use the same guidelines as commit messages to write the PR title and description. The server changelog is automatically generated from PR titles, so think about how you can make the changelog informative and easy to understand. The description should tell how the change affects the server's behavior and motivation for doing the change.
* If we suggest changes then:
  * Make the required updates.
  * Rebase your branch and force push to your GitHub repository (this will update your Pull Request):

    ```shell
    git rebase master -i
    git push -f
    ```


#### After your pull request is merged

After your pull request is merged, you can safely delete your branch and pull the changes from the main (upstream) repository:

* Delete the remote branch on GitHub either through the GitHub web UI or your local shell as follows:

    ```shell
    git push origin --delete my-fix-branch
    ```

* Check out the master branch:

    ```shell
    git checkout master -f
    ```

* Delete the local branch:

    ```shell
    git branch -D my-fix-branch
    ```

* Update your master with the latest upstream version:

    ```shell
    git pull --ff upstream master
    ```
