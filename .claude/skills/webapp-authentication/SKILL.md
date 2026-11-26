---
name: webapp-authentication
description: How a Signal K webapp finds out whether security is on and who is logged in, sends authenticated requests and hands sign-in to the server. Use when writing or reviewing webapp code that calls the server's APIs, opens a WebSocket, shows a login prompt or manages tokens.
---

# Webapp authentication

The contract is described in "Authentication and Session Management" in `docs/develop/webapps.md`, and the `loginStatus` response in the `LoginStatus` schema of `src/api/security/openApi.json`. Read those for details; this skill says which mechanism to pick and what to avoid.

## Find out where the browser stands

Call `GET /skServer/loginStatus` when the webapp starts. It needs no authentication.

- `authenticationRequired` missing or `false`: security is off, every request has full access. Show the webapp, never a login prompt.
- `status` is `loggedIn`: `username` and `userLevel` (`readonly`, `readwrite` or `admin`) say who and with what rights.
- `status` is `notLoggedIn` with security on: show what `readOnlyAccess` allows, or send the user to log in.

Fields that do not apply are left out: a missing flag means `false`, a missing `username` means not logged in.

## Send requests with the shared session

Use cookie based sessions: `fetch(url, { credentials: 'include' })`. A webapp served by the server gets the cookie with the default `same-origin` too, but `include` keeps it working when the webapp runs from a dev server on another port. The browser sends the server's HttpOnly session cookie, and opening a WebSocket sends it too, so a WebSocket needs no token. Every webapp on the server shares this session, including the Admin UI.

Do not keep a token in the webapp (localStorage, an `Authorization` header, a `?token=` query) unless it has no browser session to share, such as a native client. A webapp that logs in with its own token also sets the shared cookie, which confuses the sessions of the other webapps.

The session cookie is HttpOnly, so JavaScript cannot read it. To notice a login or logout in another tab, watch the `skLoginInfo` cookie or call `loginStatus` again.

## Hand sign-in to the server

Do not build a login form. Send the browser to the Admin UI's login page with a `redirect` back to the webapp:

```js
const here =
  window.location.pathname + window.location.search + window.location.hash
window.location.href = '/admin/#/login?redirect=' + encodeURIComponent(here)
```

This covers form login and OIDC; when only OIDC is used, `/signalk/v1/auth/oidc/login?redirect=…` skips the Admin UI. The `redirect` must be a same-origin path starting with a single `/`; anything else is ignored.

Do the same when a request returns 401 during use: the session has expired or been revoked.

## Reviewing a webapp

Flag, in order:

1. A login form of its own, or a stored password.
2. Tokens kept in localStorage or sent as headers or `?token=` where `credentials: 'include'` would do.
3. `credentials: 'omit'`, or a webapp meant to run from another origin without `credentials: 'include'`: its requests reach the server without the session.
4. A login prompt shown without checking `authenticationRequired`, which breaks servers without security.
5. A `redirect` built from an absolute URL, which the server ignores.
