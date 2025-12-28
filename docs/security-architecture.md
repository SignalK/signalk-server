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
3. **Token Security** (`src/tokensecurity.js`) - Full implementation with JWT-
   based authentication
4. **OIDC Module** (`src/oidc/`) - OpenID Connect authentication support

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Signal K Server                          │
│                                                                 │
│  ┌─────────────────────┐       ┌─────────────────────────────┐ │
│  │    security.ts      │       │     tokensecurity.js        │ │
│  │                     │       │                             │ │
│  │ - SecurityStrategy  │◄──────│ - login/logout routes       │ │
│  │   interface         │       │ - JWT token management      │ │
│  │ - startSecurity()   │       │ - Session cookie management │ │
│  │ - saveSecurityConfig│       │ - User/device management    │ │
│  └─────────────────────┘       │ - ACL enforcement           │ │
│           ▲                    └──────────────┬──────────────┘ │
│           │                                   │                │
│           │                                   │ Dependencies   │
│  ┌────────┴────────┐                         ▼                │
│  │ dummysecurity.ts │           ┌─────────────────────────────┐ │
│  │                  │           │       src/oidc/             │ │
│  │ - No-op impl     │           │                             │ │
│  │ - Used when      │           │ ┌─────────────────────────┐ │ │
│  │   security       │           │ │     oidc-auth.ts        │ │ │
│  │   disabled       │           │ │                         │ │ │
│  └──────────────────┘           │ │ - registerOIDCRoutes()  │ │ │
│                                 │ │ - findOrCreateOIDCUser()│ │ │
│                                 │ └────────────┬────────────┘ │ │
│                                 │              │uses          │ │
│                                 │ ┌────────────┴────────────┐ │ │
│                                 │ │ Helper Modules          │ │ │
│                                 │ │ - config.ts             │ │ │
│                                 │ │ - state.ts              │ │ │
│                                 │ │ - pkce.ts               │ │ │
│                                 │ │ - discovery.ts          │ │ │
│                                 │ │ - authorization.ts      │ │ │
│                                 │ │ - token-exchange.ts     │ │ │
│                                 │ │ - id-token-validation.ts│ │ │
│                                 │ └─────────────────────────┘ │ │
│                                 └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Security Strategy Interface

The `SecurityStrategy` interface (`src/security.ts`) defines the methods that
a security implementation must provide:

### Core Methods

- `isDummy()`: Returns true for dummy implementation
- `allowReadOnly()`: Whether anonymous read access is allowed
- `getConfiguration()`: Returns the security configuration

### Authentication Methods

- `getLoginStatus()`: Current authentication status
- `generateToken()`: Create a JWT for authenticated access

### Authorization Methods

- `allowRestart()`: Can the user restart the server?
- `allowConfigure()`: Can the user modify configuration?
- `shouldAllowWrite()`: Check write permission for deltas
- `shouldAllowPut()`: Check PUT permission

### User Management

- `getUsers()`: List all users
- `addUser()`: Create a new user
- `updateUser()`: Modify user properties
- `deleteUser()`: Remove a user
- `setPassword()`: Change user password

### Device Management

- `getDevices()`: List registered devices
- `updateDevice()`: Modify device properties
- `deleteDevice()`: Remove a device

### Access Control

- `filterReadDelta()`: Filter delta data based on ACLs
- `shouldFilterDeltas()`: Whether ACL filtering is active

## Token Security Implementation

`tokensecurity.js` is the production security implementation. It provides:

### Authentication Flow

1. **Local Login**: Username/password via `/login` or `/signalk/v1/auth/login`
2. **OIDC Login**: Delegates to `oidc-auth.ts` for SSO authentication
3. **Device Access Requests**: Devices can request access tokens

### Session Management

Sessions are managed via HTTP-only cookies:

- `JAUTHENTICATION`: The JWT token
- `skLoginInfo`: Login status for JavaScript access (non-httpOnly)

Session cookie helpers ensure consistent security settings:

- `httpOnly: true` (for JAUTHENTICATION)
- `sameSite: 'strict'`
- `secure: true` (when over HTTPS)

### Token Format

JWTs contain:

```json
{
  "id": "username",
  "exp": 1234567890
}
```

## OIDC Integration

The OIDC module provides OpenID Connect authentication for Single Sign-On.

### Architecture

```
┌──────────────┐     ┌───────────────────┐     ┌──────────────────┐
│   Browser    │────▶│  Signal K Server  │────▶│  OIDC Provider   │
│              │◀────│                   │◀────│  (Keycloak, etc) │
└──────────────┘     └───────────────────┘     └──────────────────┘
```

### Authentication Flow

1. User clicks "SSO Login"
2. Server creates state, stores in encrypted cookie
3. Redirects to OIDC provider's authorization endpoint
4. User authenticates with provider
5. Provider redirects back with authorization code
6. Server exchanges code for tokens
7. Server validates ID token
8. Server creates/updates local user record
9. Server issues local JWT session

### Logout Flow (RP-Initiated)

The `/signalk/v1/auth/oidc/logout` endpoint supports OpenID Connect RP-Initiated
Logout:

1. User clicks "Logout"
2. Server clears local session cookies
3. If provider supports `end_session_endpoint`:
   - Redirects to provider's logout endpoint with `post_logout_redirect_uri`
   - Provider logs out the user and redirects back
4. If provider doesn't support logout, redirects locally

This ensures users are logged out of both Signal K and the identity provider.

### Dependency Injection

`oidc-auth.ts` receives dependencies from tokensecurity via the
`OIDCAuthDependencies` interface:

```typescript
interface OIDCAuthDependencies {
  getConfiguration: () => SecurityConfig
  getOIDCConfig: () => OIDCConfig
  setSessionCookie: (res, req, token, username, options?) => void
  clearSessionCookie: (res) => void
  generateJWT: (userId, expiration?) => string
  saveConfig: (config, callback) => void
}
```

This design:

- Avoids circular dependencies
- Allows tokensecurity to own session management
- Keeps OIDC code focused on OIDC-specific logic
- Makes testing easier through dependency injection

### Helper Modules

Each OIDC helper module has a single responsibility:

| Module                   | Responsibility                 |
| ------------------------ | ------------------------------ |
| `config.ts`              | Parse and validate OIDC config |
| `state.ts`               | Create/encrypt/decrypt state   |
| `pkce.ts`                | Generate PKCE code verifier    |
| `discovery.ts`           | Fetch OIDC provider metadata   |
| `authorization.ts`       | Build authorization URLs       |
| `token-exchange.ts`      | Exchange code for tokens       |
| `id-token-validation.ts` | Validate ID token signatures   |

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
