---
title: Publishing to The AppStore
---

# Publishing to The AppStore

Plugins and WebApps are available in the AppStore when they have been published to the [npm registry](https://www.npmjs.com/) with one or more of the following keywords in `package.json`:

- `signalk-node-server-plugin`
- `signalk-webapp`

Additionally you can have your plugin appear within one or more AppStore categories by also adding the following keyword(s):

- `signalk-category-chart-plotters`
- `signalk-category-nmea-2000`
- `signalk-category-nmea-0183`
- `signalk-category-instruments`
- `signalk-category-hardware`
- `signalk-category-ais`
- `signalk-category-notifications`
- `signalk-category-digital-switching`
- `signalk-category-utility`
- `signalk-category-cloud`
- `signalk-category-weather`
- `signalk-category-database`
- `signalk-category-deprecated`

To have your plugin start automatically after being installed, without requiring any configuration via the **Plugin Config** screen add the following key to the `package.json` file:

```JSON
"signalk-plugin-enabled-by-default": true
```

To control the way your plugin or WebApp is displayed in the AppStore, add a `signalk` key to your `package.json`. All fields are optional:

```JSON
  "signalk": {
    "displayName": "My SK App",
    "appIcon": "./img/icon-128.png",
    "screenshots": [
      "./docs/screenshots/main.png",
      "./docs/screenshots/config.png"
    ],
    "requires": ["signalk-charts-plugin"],
    "recommends": ["@signalk/freeboard-sk"]
  }
```

## `displayName`

A human-friendly name shown in the AppStore. Can contain spaces and capitals. Good: `"KIP"`, `"Freeboard-SK"`, `"Anchor Alarm"`. If omitted, the npm package name is used.

## Author

The AppStore shows an author name on each plugin card. It is resolved in this order, picking the first non-empty value:

1. The top-level `author` field in your `package.json` — either a string (`"Dirk Wahrheit <dirkwahrheit@gmail.com>"`) or an object (`{ "name": "Dirk Wahrheit", ... }`).
2. The npm `publisher` of the published version — _unless_ that publisher is `GitHub Actions`, which is the deploy identity used by [npm trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers) and not a human.
3. The first npm `maintainer` of the package.

Set `author` in `package.json` so the AppStore shows your name even when you publish via OIDC. Without it, OIDC-published plugins fall back to the maintainer username.

## `appIcon`

Package-relative path to an icon image (PNG or SVG), at least 128×128 px square. If omitted, the AppStore generates a monogram fallback from your plugin name.

## `screenshots`

Ordered list of package-relative paths to screenshots (PNG or JPG). Recommended 1280×800 (16:10); keep each file under ~500 KB. Up to **6** are shown — additional entries are ignored. The first screenshot becomes the hero image on the detail page, so put your best shot first.

Files must be published to npm — check your `files` field and `.npmignore`. Before releasing, verify with:

```shell
npm pack --dry-run | grep -E '(screenshots|icon)'
```

If the command prints nothing, the listed assets are not in the tarball — adjust your `files` field or `.npmignore`.

Use package-relative paths. Relative images in your `README.md` (`![caption](./docs/foo.png)`) render inline on the AppStore detail page.

If no screenshots are declared, the detail page omits the hero image and shows a polite note. The card and list views degrade silently.

## `requires` and `recommends`

Declare other AppStore plugins your plugin relies on:

- **`requires`** — mandatory companion plugins. The AppStore lists them on the detail page; if any are missing when a user installs, an **Install required plugins** button queues your plugin plus the missing required plugins in one go.
- **`recommends`** — suggested companions. Listed on the detail page as click-through cards, advisory only.

These are _AppStore-only_ semantics — they're not npm dependencies, so npm won't auto-install them. Use them for cross-plugin composition that isn't bundled in a tarball (e.g. a plotter plugin that pairs with a chart-provider plugin).

Entries must be published npm package names exactly as they appear in the AppStore. Plugins that aren't available in the AppStore will still render as a link on the detail page but marked "Not installed".

**Don't use `peerDependencies` for companion plugins.** Use `signalk.requires` / `signalk.recommends` to express companion-plugin relationships. The AppStore's `requires` mechanism gives the user a clean **Install required plugins** flow without involving npm's resolver, which interacts badly with optional peers under Signal K's plugin tree.

## Deprecation

If your plugin is superseded or no longer maintained, either add the `signalk-deprecated` keyword or set `signalk.deprecated: true`. The AppStore will hide deprecated plugins from general browsing but continue to show them to users who already have them installed (with a red banner on the detail page). Users can opt in to seeing all deprecated plugins via a filter toggle.

## What shows on the detail page

Every plugin gets a per-plugin detail page in the App Store admin with README, Changelog, and Indicators tabs. Keep your README scannable — most users will read it before installing — and maintain a `CHANGELOG.md` with version headers (`## 1.2.0`) or publish GitHub Releases so the Changelog tab has content to show.

## CI test results in the App Store

If your plugin's repository runs the reusable [SignalK plugin-ci workflow](https://github.com/SignalK/signalk-server/blob/master/.github/workflows/plugin-ci.yml), the App Store Indicators tab shows the resulting per-platform pass/fail matrix for the published version — green for success, red for failure, grey for skipped or disabled platforms.

To opt in, add a small workflow on your repo that calls the reusable plugin-ci. The current usage line (job inputs, supported platforms, Node versions) is documented at the top of the canonical [`plugin-ci.yml`](https://github.com/SignalK/signalk-server/blob/master/.github/workflows/plugin-ci.yml) — follow that file rather than copy-pasting examples that may drift over time.

_Example: package.json_

```JSON
{
  "name": "my-signalk-plugin-app",
  "version": "1.0.0",
  "description": "My great signalk plugin-app",
  "keywords": [
    "signalk-node-server-plugin",
    "signalk-webapp",
    "signalk-category-ais"
  ],
  "signalk-plugin-enabled-by-default": true,
  "signalk": {
    "appIcon": "./assets/icons/icon-72x72.png",
    "displayName": "My Great WebApp"
  },
  "main": "plugin/index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "author": "Jane Sailor <jane@example.com>",
  "license": "ISC"
}
```

## Important: Avoid install-time scripts

For security reasons, the Signal K AppStore does not execute install-time lifecycle scripts when installing plugins — `preinstall`, `install`, and `postinstall` scripts in your plugin's `package.json` will not run when users install through the App Store.

Ensure your published package is ready to use without requiring install-time scripts. If you need build steps, use `prepublishOnly` instead — it runs before you publish to npm, so the published tarball already contains everything it needs.

## Publishing your Plugin

Once you have developed and tested your Plugin / WebApp you can publish it to make it visible in the AppStore.
To do this, in a terminal session from within the folder containing `package.json`:

```shell
npm publish
```
