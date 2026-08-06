# Styling Guide

This project is built on **Bootstrap 5.3** — it's the foundation for
essentially all UI, not just a CSS reset or a grid system we happen to
include. Before writing new styles or markup, work from these two
defaults:

1. **Don't build a bespoke component if a Bootstrap component already does
   the job.** Cards, modals, dropdowns, nav, tables, forms, buttons, badges,
   spinners — check [Bootstrap's component docs](https://getbootstrap.com/docs/5.3/components/)
   first. A custom-built equivalent means more code for us to maintain,
   inconsistent behavior/accessibility versus the rest of the app, and it
   won't pick up Bootstrap updates or our theme (light/dark/auto) for free
   the way a real Bootstrap component does.
2. **Don't define a new color if an existing one is already close enough.**
   Check Bootstrap's published palette and our own `--sk-*` tokens before
   adding anything to `_bootstrap-variables.scss`. Two near-identical blues
   defined slightly differently is exactly the kind of drift this guide is
   meant to prevent. See [Resources](#resources) below for where to look.

The rest of this document explains the _why_ behind our CSS/SCSS
conventions — the linter enforces most of these mechanically, but the
reasoning behind each rule isn't always obvious from the config alone. Read
this before changing styles or touching `stylelint.config.js` /
`.prettierrc.json`.

## Sass variables vs. CSS custom properties

Bootstrap ships two parallel systems, and it matters which one you reach for:

- **Sass variables** (`$primary`, `$white`, …) are resolved at **compile
  time**. Once built, they're frozen into the output CSS.
- **CSS custom properties** (`--bs-primary`, `--bs-white`, `--sk-*`, …) are
  resolved at **runtime** — they can change live via `[data-bs-theme=dark]`,
  a class, or inline styles, with no rebuild required.

**We use CSS variables everywhere in authored/component styling** — never a
raw hex value, never a `$sass-variable` reference in component CSS/SCSS.

This isn't just a style preference: it's required by our light/dark/auto
theme switching. That mechanism depends on CSS custom properties resolving
differently depending on the active theme. A Sass variable can't do this —
its value is baked in the moment Sass compiles, long before the browser
knows which theme is active. If you write `color: $primary` instead of
`color: var(--bs-primary)`, that rule will not react when a user switches
themes.

**The one place Sass variables still belong:** `src/styles/_bootstrap-variables.scss`,
where we set the base token _values_ Bootstrap compiles into CSS variables in the
first place. That's compile-time configuration of the palette, not runtime
styling — which is also why that file (and only that file, plus the vendored
`core/` directory) is exempt from the `color-no-hex` family of rules.

Everywhere else: `var(--bs-*)` for Bootstrap tokens, `var(--sk-*)` for our
own. If you need a color that doesn't have a token yet, add one to
`_bootstrap-variables.scss` rather than reaching for a literal.

## Directory structure

- **`src/styles/core/`** — vendored, unmodified CoreUI-era CSS. We don't
  maintain this and generally won't act on lint findings in it. It's fully
  excluded from both Stylelint (`ignoreFiles`) and Prettier
  (`.prettierignore`) for that reason — not because it's exempt from our
  standards, but because there's no plan to bring it into line with them.
- **Everything else under `src/styles/`** — actively maintained, held to
  full governance (see below).
- **Component-scoped styles** (e.g. `views/Dashboard/Dashboard.css`) —
  colocate styles that are genuinely specific to one component. Don't
  colocate something generic just because only one component happens to use
  it today (e.g. a FontAwesome animation utility belongs in `src/styles/`,
  not inside a single view's folder, even if only that view uses it right
  now).

## Stylelint: what it's for, and what's deliberately turned off

Stylelint here is **governance**, not formatting — Prettier owns formatting
(indentation, quotes, line breaks) and Stylelint owns rules that catch real
mistakes or enforce conventions Prettier can't express (like "no raw hex
colors").

A few rules are intentionally disabled. If you're tempted to re-enable one,
read the reason first:

| Rule                     | Status | Why                                                                                                                                                                                 |
| ------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rule-empty-line-before` | off    | Prettier doesn't manage blank-line placement and will never satisfy this rule automatically — it's not deprecated in Stylelint, just a genuine ongoing conflict with our formatter. |
| `scss/comment-no-empty`  | off    | We use Bootstrap's own banner-comment convention for section headers (see below), which uses bare `//` lines that this rule flags as "empty."                                       |

Everything else — `color-no-hex`, `color-named`, `function-disallowed-list`,
`declaration-property-value-no-unknown`, etc. — is enforcing something real.
If a rule is firing and you're not sure why, ask before disabling it.

**Known gap:** color rules only catch raw colors at _usage_ sites (`color:`,
`background-color:`, …), not inside custom-property _definitions_
(`--bs-btn-color: #fff;`). Stylelint can't tell whether a custom property is
meant to hold a color, so it doesn't flag these — but the same governance
intent applies. When overriding component-level Bootstrap variables
(`--bs-btn-*`, `--bs-nav-*`, etc.), use `var(--bs-*)`/`var(--sk-*)` there
too, even though the linter won't catch you if you don't.

## Comment style

Section-header banners using bare `//` border lines are intentional and
match Bootstrap's own source convention:

```scss
//
// Color system
//
$white: #fff;
```

Note: no blank line between the closing `//` and the first variable — that
matches Bootstrap's own formatting and satisfies
`scss/dollar-variable-empty-line-before`'s `after-comment` exception.

## Deprecated CSS properties

Prefer `overflow-wrap: anywhere` over the legacy `word-wrap` /
`word-break: break-word` pairing. The old pairing behaves like
`overflow-wrap: anywhere` in practice (per spec, `word-break: break-word`
forces that behavior regardless of the `overflow-wrap` value) — so replace
both properties with the single modern equivalent rather than just renaming
`word-wrap` to `overflow-wrap` and leaving `word-break` in place.

## Resources

Before adding a new color, token, or override, check whether Bootstrap
already has what you need:

- [CSS variables](https://getbootstrap.com/docs/5.3/customize/css-variables/) —
  the full list of `--bs-*` custom properties Bootstrap ships (colors,
  RGB triplets, fonts, breakpoints). Check here before inventing a new
  `--sk-*` token that duplicates something Bootstrap already provides.
- [Colors](https://getbootstrap.com/docs/5.3/customize/color/) — the 5.3
  color system, including the newer `-text-emphasis` / `-bg-subtle` /
  `-border-subtle` variants added for dark-mode-aware theming.
- [Utilities: Colors](https://getbootstrap.com/docs/5.3/utilities/colors/) —
  how `.text-*` / `.bg-*` utility classes use CSS variables internally
  (useful background if you're wondering why a color utility isn't
  behaving the way a plain CSS variable would).
- [Sass](https://getbootstrap.com/docs/5.3/customize/sass/) — the source
  Sass variables/maps `_bootstrap-variables.scss` overrides before Bootstrap
  compiles.

If a color you need isn't in Bootstrap's published set, that's when a new
`--sk-*` token belongs in `_bootstrap-variables.scss` — not a one-off hex
value in the component file that happens to need it.

## Running the checks

```bash
npm run lint:css      # Stylelint — governance rules
npm run format         # Prettier — formatting
npm run dev            # Vite dev server — visually confirm nothing broke
```

When autofixing (`stylelint --fix`), review the diff before committing —
most fixes (hex shorthand, modern color-function notation) are purely
mechanical, but a few categories are worth a second look:

- Merges into shorthand properties (`gap`, `place-self`) — safe as long as
  the longhand values weren't intentionally different.
- Renamed `@keyframes` — check nothing else in the codebase (another
  stylesheet, or a `.tsx` file) still references the old name.
