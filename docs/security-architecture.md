---
title: Security Architecture
---

# Security Architecture

This document describes the architecture of Signal K Server's security system,
including how the various components interact.

## Overview

Signal K Server uses a pluggable security strategy pattern. The security system
consists of:

1. **Security Strategy Interface** (`src/security.ts`) - Defines the contract
   for security implementations
2. **Dummy Security** (`src/dummysecurity.ts`) - No-op implementation when
   security is disabled
3. **Token Security** (`src/tokensecurity.ts`) - Full implementation with JWT-
   based authentication
4. **Authentication Providers** (`src/auth/`) - passport-based login methods
   (redirect flows) that plugins can extend
5. **OIDC Module** (`src/oidc/`) - the built-in OpenID Connect provider

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Signal K Server                          │
│                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────────────┐ │
│  │    security.ts      │       │     tokensecurity.ts        │ │
│  │                     │       │                             │ │
│  │ - SecurityStrategy  │◄──────│ - login/logout routes       │ │
│  │   interface         │       │ - JWT token management      │ │
│  │ - startSecurity()   │       │ - Session cookie management │ │
│  │ - saveSecurityConfig│       │ - User/device management    │ │
│  └─────────────────────┘       │ - ACL enforcement           │ │
│           ▲                    └──────────────┬──────────────┘ │
│           │                                   │                │
│  ┌────────┴────────┐                          ▼                │
│  │ dummysecurity.ts │           ┌─────────────────────────────┐ │
│  │                  │           │        src/auth/            │ │
│  │ - No-op impl     │           │                             │ │
│  │ - Used when      │           │ - providers.ts: registry +  │ │
│  │   security       │           │   /signalk/v1/auth/:id/*    │ │
│  │   disabled       │           │ - provisioning.ts: identity │ │
│  └──────────────────┘           │   -> local user             │ │
│                                 │ - handshake-session.ts      │ │
│                                 └──────────────▲──────────────┘ │
│                                                │ registers      │
│                                 ┌──────────────┴──────────────┐ │
│                                 │  src/oidc/ (built-in)       │ │
│                                 │  plugins (any passport      │ │
│                                 │  strategy)                  │ │
│                                 └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Security Strategy Interface

The `SecurityStrategy` interface (`src/security.ts`) defines the methods that
a security implementation must provide:

## Token Security Implementation

`tokensecurity.ts` is the production security implementation. It provides:

### Authentication Flow

1. **Local Login**: Username/password via `/login` or `/signalk/v1/auth/login`
2. **Provider Login**: Any registered authentication provider (OIDC or a
   plugin's passport strategy) via `/signalk/v1/auth/<id>/login`
3. **Device Access Requests**: Devices can request access tokens

### Session Management

Sessions are managed via HTTP-only cookies:

- `JAUTHENTICATION`: The JWT token
- `skLoginInfo`: Login status for JavaScript access (non-httpOnly)

Session cookie helpers ensure consistent security settings:

- `httpOnly: true` (for JAUTHENTICATION)
- `sameSite: 'strict'`
- `secure: true` (when over HTTPS)

The server implements a sliding session window: when a JWT token is past the midpoint of its lifetime, the next HTTP request silently replaces the cookie with a freshly issued token. This keeps active users logged in indefinitely while inactive sessions still expire after the configured duration.

## Authentication Providers

`src/auth/providers.ts` keeps a registry of login methods, each backed by a
[passport](https://www.passportjs.org/) strategy, on a private passport
instance. `SecurityStrategy.registerAuthenticationProvider()` (exposed to
plugins as `app.registerAuthenticationProvider()`) adds one at runtime.

### Authentication Flow

1. User picks a provider on the login page (`loginStatus.authProviders`)
2. `GET /signalk/v1/auth/<id>/login?redirect=` stores the return path in the
   handshake session and runs `passport.authenticate(<id>)`; the strategy
   redirects to the identity provider
3. Provider redirects back to `GET|POST /signalk/v1/auth/<id>/callback`
4. The strategy verifies the response and its verify callback returns an
   `ExternalIdentity` (subject, issuer, username, permission, email, name)
5. `provisioning.ts` finds the local user by provider + issuer + subject, or
   creates one (persisting `security.json` before the record becomes
   visible; calls are serialized so concurrent first logins cannot create
   duplicates), and refreshes permission and identity details
6. `tokensecurity` issues the regular JWT session cookies and redirects to
   the stored return path

Passport strategies keep their state (PKCE verifier, nonce) in `req.session`.
`handshake-session.ts` provides that as an AES-256-GCM encrypted cookie
scoped to `/signalk/v1/auth`, keyed from the master secret; there is no
server-side session store.

### Logout Flow

`GET /signalk/v1/auth/<id>/logout` clears the local session cookies and asks
the provider for a logout URL. The OIDC provider returns the identity
provider's `end_session_endpoint` with `post_logout_redirect_uri` derived
from the configured `redirectUri`, so the user is logged out of both.

## OIDC Provider

`src/oidc/` is the built-in OpenID Connect provider, registered through the
same registry as plugin providers:

| Module                  | Responsibility                                         |
| ----------------------- | ------------------------------------------------------ |
| `config.ts`             | Parse and validate OIDC config (env + security.json)   |
| `provider.ts`           | Strategy from `openid-client/passport`, lazy discovery |
| `permission-mapping.ts` | Map groups claim to Signal K permission                |
| `oidc-admin.ts`         | Admin API: GET/PUT `/security/oidc`, connection test   |

Discovery runs on the first login attempt (the identity provider may boot
after Signal K) and is cached until the configuration changes.

## Configuration

Security configuration is stored in `security.json`:

```json
{
  "users": [...],
  "devices": [...],
  "secretKey": "...",
  "expiration": "1h",
  "allow_readonly": true,
  "acls": [...],
  "oidc": {
    "enabled": true,
    "issuer": "https://...",
    "clientId": "...",
    "clientSecret": "..."
  }
}
```

Environment variables can override configuration values. OIDC secrets are
recommended to be set via environment variables (`SIGNALK_OIDC_*`).

## Strategy Selection

The security strategy is selected at startup in `startSecurity()`:

1. Check `SECURITYSTRATEGY` environment variable
2. Check `config.settings.security.strategy` in settings
3. Fall back to `dummysecurity` if neither is set

The strategy is dynamically loaded and attached to `app.securityStrategy`.
