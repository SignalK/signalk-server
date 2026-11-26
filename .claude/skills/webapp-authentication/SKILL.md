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

Use the server's session cookie. A webapp served by the server is on the server's origin, so `fetch` sends the HttpOnly cookie by default, and opening a WebSocket sends it too; neither needs a token. Every webapp on the server shares this session, including the Admin UI.

During development, let the dev server proxy `/signalk`, `/skServer`, `/admin` and `/plugins` to the Signal K server, WebSockets included, so the webapp stays on one origin and the cookie, `loginStatus` and the login redirect below behave as in production. Calling the server from another origin instead needs `credentials: 'include'` and that origin in the server's `allowedCorsOrigins`, and the login redirect cannot return to it. That works only from the same site (the same host on another port): the session cookie is `SameSite=Strict`, so a webapp on another host or scheme never gets it and every request arrives logged out.

Do not keep a token in the webapp (localStorage, an `Authorization` header, a `?token=` query) unless it has no browser session to share, such as a native client. A webapp that logs in with its own token also sets the shared cookie, which confuses the sessions of the other webapps.

The session cookie is HttpOnly, so JavaScript cannot read it. To notice a login or logout in another tab, watch the `skLoginInfo` cookie or call `loginStatus` again.

## Hand sign-in to the server

Do not build a login form. Send the browser to the Admin UI's login page, `/admin/#/login`, with a `redirect` back to the webapp's current path; the example is under "Redirecting unauthenticated users to login" in `docs/develop/webapps.md`. This covers form login and OIDC; when only OIDC is used, `/signalk/v1/auth/oidc/login?redirect=…` skips the Admin UI. The `redirect` must be a same-origin path starting with a single `/`; anything else is ignored.

When a request returns 401 during use, call `loginStatus` again. Without security (`authenticationRequired` missing or `false`) there is no login to offer: show the error. With security on, `notLoggedIn` means the session expired or was revoked: send the user to log in. `loggedIn` means the user lacks the permission, for example a `readonly` user trying to write: show that instead of sending them to a login that changes nothing.

## Reviewing a webapp

Flag, in order:

1. A login form of its own, or a stored password.
2. Tokens kept in localStorage or sent as headers or `?token=` where the session cookie would do.
3. `credentials: 'omit'`, or a webapp that calls the server from another origin without `credentials: 'include'` and an `allowedCorsOrigins` entry: its requests reach the server without the session.
4. Every 401 treated as logged out, which sends a `readonly` user into a login loop.
5. A login prompt shown without checking `authenticationRequired`, which breaks servers without security.
6. A `redirect` built from an absolute URL, which the server ignores.
