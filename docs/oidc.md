---
title: OIDC Authentication
---

# OpenID Connect (OIDC) Authentication

Signal K Server supports OpenID Connect (OIDC) authentication. This enables Single Sign-On (SSO) with identity providers (IdPs) running on your local network ([Keycloak](https://www.keycloak.org/), [Authentik](https://goauthentik.io/), [Authelia](https://www.authelia.com/)) or cloud services (Auth0, Okta, and others).

## Overview

OIDC authentication provides:

- **Single Sign-On (SSO)**: Users **authenticate once** with the identity provider and the login information can be shared with **multiple applications**, such as Grafana.
- **Modern authentication methods**: The IdP may support modern authentication methods such as [Passkey](https://safety.google/safety/authentication/passkey/) and Multi-factor authentication without implementing everything within Signal K
- **Centralized User Management**: Manage users in your identity provider, not in Signal K
- **Group-Based Permissions**: Map identity provider groups to Signal K permission levels
- **Auto-Provisioning**: Automatically create Signal K users on first OIDC login

OIDC works alongside local authentication. You can have both local users and OIDC users simultaneously.

## Quick Start

### 1. Register Signal K as an OIDC Client

In your identity provider, create a new OIDC/OAuth2 client application:

- **Client ID**: Choose a name like `signalk-server`
- **Client Type**: Confidential (requires client secret)
- **Grant Type**: Authorization Code
- **Redirect URI**: `https://your-signalk-server:3000/signalk/v1/auth/oidc/callback`

Note the **Client ID** and **Client Secret** for the next step.

### 2. Configure Signal K

OIDC can be configured via environment variables or the Admin UI.

#### Using Environment Variables

```bash
export SIGNALK_OIDC_ENABLED=true
export SIGNALK_OIDC_ISSUER=https://auth.example.com
export SIGNALK_OIDC_CLIENT_ID=signalk-server
export SIGNALK_OIDC_CLIENT_SECRET=your-client-secret
```

#### Using the Admin UI

1. Navigate to **Security > OIDC Configuration**
2. Enable OIDC
3. Enter your provider's Issuer URL
4. Enter the Client ID and Client Secret
5. Click **Save**

### 3. Test the Configuration

1. Log out of Signal K
2. On the login page, click the SSO login button
3. You should be redirected to your identity provider
4. After authenticating, you'll be redirected back to Signal K

## Configuration Reference

### Environment Variables

| Variable                          | Required | Default                | Description                                                   |
| --------------------------------- | -------- | ---------------------- | ------------------------------------------------------------- |
| `SIGNALK_OIDC_ENABLED`            | Yes      | `false`                | Enable OIDC authentication                                    |
| `SIGNALK_OIDC_ISSUER`             | Yes      | -                      | OIDC provider URL (e.g., `https://auth.example.com`)          |
| `SIGNALK_OIDC_CLIENT_ID`          | Yes      | -                      | Client ID registered with the provider                        |
| `SIGNALK_OIDC_CLIENT_SECRET`      | Yes      | -                      | Client secret from the provider                               |
| `SIGNALK_OIDC_SCOPE`              | No       | `openid email profile` | OAuth scopes to request (add `groups` for permission mapping) |
| `SIGNALK_OIDC_DEFAULT_PERMISSION` | No       | `readonly`             | Default permission for new users                              |
| `SIGNALK_OIDC_AUTO_CREATE_USERS`  | No       | `true`                 | Auto-create users on first login                              |
| `SIGNALK_OIDC_ADMIN_GROUPS`       | No       | -                      | Comma-separated groups that grant admin                       |
| `SIGNALK_OIDC_READWRITE_GROUPS`   | No       | -                      | Comma-separated groups that grant readwrite                   |
| `SIGNALK_OIDC_GROUPS_ATTRIBUTE`   | No       | `groups`               | ID token claim containing groups                              |
| `SIGNALK_OIDC_PROVIDER_NAME`      | No       | `SSO Login`            | Button text on login page                                     |
| `SIGNALK_OIDC_AUTO_LOGIN`         | No       | `false`                | Auto-redirect to OIDC provider                                |
| `SIGNALK_OIDC_REDIRECT_URI`       | No       | Auto-detected          | Override the callback URL                                     |

### security.json Configuration

OIDC can also be configured in `security.json`:

```json
{
  "oidc": {
    "enabled": true,
    "issuer": "https://auth.example.com",
    "clientId": "signalk-server",
    "clientSecret": "your-client-secret",
    "scope": "openid email profile groups",
    "defaultPermission": "readonly",
    "autoCreateUsers": true,
    "adminGroups": ["admins", "sk-admin"],
    "readwriteGroups": ["users"],
    "groupsAttribute": "groups",
    "providerName": "Corporate SSO",
    "autoLogin": false
  }
}
```

**Note**: Environment variables take precedence over `security.json` settings.

## Permission Mapping

Signal K maps OIDC groups to permission levels in this priority order:

1. **Admin**: User belongs to any group in `adminGroups`
2. **Read/Write**: User belongs to any group in `readwriteGroups`
3. **Default**: User gets `defaultPermission` (default: `readonly`)

### Example Configuration

```bash
# Users in "admins" or "signalk-admins" get admin access
SIGNALK_OIDC_ADMIN_GROUPS=admins,signalk-admins

# Users in "crew" or "operators" get read/write access
SIGNALK_OIDC_READWRITE_GROUPS=crew,operators

# Everyone else gets read-only access
SIGNALK_OIDC_DEFAULT_PERMISSION=readonly
```

### Groups Claim

By default, Signal K looks for groups in the `groups` claim of the ID token. Some providers use different claim names:

| Provider    | Groups Claim               |
| ----------- | -------------------------- |
| Keycloak    | `groups` (requires mapper) |
| Authentik   | `groups`                   |
| Auth0       | Custom (requires rule)     |
| Okta        | `groups`                   |
| Azure AD    | `groups`                   |
| AWS Cognito | `cognito:groups`           |

Configure the claim name:

```bash
SIGNALK_OIDC_GROUPS_ATTRIBUTE=cognito:groups
```

## Provider Setup Guides

### Keycloak

1. Create a new client in your realm:
   - **Client ID**: `signalk-server`
   - **Client Protocol**: `openid-connect`
   - **Access Type**: `confidential`
   - **Valid Redirect URIs**: `https://your-server:3000/signalk/v1/auth/oidc/callback`

2. Add a groups mapper:
   - Go to **Clients > signalk-server > Mappers**
   - Click **Create**
   - **Name**: `groups`
   - **Mapper Type**: `Group Membership`
   - **Token Claim Name**: `groups`
   - **Add to ID token**: `ON`

3. Configure Signal K:
   ```bash
   SIGNALK_OIDC_ENABLED=true
   SIGNALK_OIDC_ISSUER=https://keycloak.example.com/realms/your-realm
   SIGNALK_OIDC_CLIENT_ID=signalk-server
   SIGNALK_OIDC_CLIENT_SECRET=<from Keycloak>
   SIGNALK_OIDC_ADMIN_GROUPS=admins
   ```

### Authentik

1. Create a new OAuth2/OIDC Provider:
   - **Name**: `Signal K Server`
   - **Client Type**: `Confidential`
   - **Redirect URIs**: `https://your-server:3000/signalk/v1/auth/oidc/callback`
   - **Scopes**: `openid email profile groups`

2. Create an Application linked to the provider

3. Configure Signal K:
   ```bash
   SIGNALK_OIDC_ENABLED=true
   SIGNALK_OIDC_ISSUER=https://authentik.example.com/application/o/signalk/
   SIGNALK_OIDC_CLIENT_ID=<from Authentik>
   SIGNALK_OIDC_CLIENT_SECRET=<from Authentik>
   SIGNALK_OIDC_SCOPE=openid email profile groups
   SIGNALK_OIDC_ADMIN_GROUPS=authentik Admins
   ```

### Authelia

[Authelia](https://www.authelia.com/) is a popular open-source authentication server.

1. Add a client configuration to your Authelia `configuration.yml`:

   ```yaml
   identity_providers:
     oidc:
       clients:
         - client_id: signalk
           client_name: Signal K Server
           client_secret: '$pbkdf2-sha512$310000$...' # Use authelia hash-password
           public: false
           authorization_policy: two_factor # or 'one_factor'
           redirect_uris:
             - https://your-signalk-server:3000/signalk/v1/auth/oidc/callback
           scopes:
             - openid
             - email
             - profile
             - groups
           userinfo_signed_response_alg: none
           token_endpoint_auth_method: client_secret_post
   ```

2. Generate the client secret hash:

   ```bash
   authelia crypto hash generate pbkdf2 --variant sha512
   ```

3. Configure Signal K:

   ```bash
   SIGNALK_OIDC_ENABLED=true
   SIGNALK_OIDC_ISSUER=https://auth.your-domain.com
   SIGNALK_OIDC_CLIENT_ID=signalk
   SIGNALK_OIDC_CLIENT_SECRET=your-unhashed-secret
   SIGNALK_OIDC_SCOPE=openid email profile groups
   SIGNALK_OIDC_DEFAULT_PERMISSION=readonly
   ```

4. For RP-initiated logout, add to Authelia's config:

   ```yaml
   identity_providers:
     oidc:
       cors:
         allowed_origins_from_client_redirect_uris: true
   ```

### Auth0

1. Create a new Regular Web Application:
   - **Allowed Callback URLs**: `https://your-server:3000/signalk/v1/auth/oidc/callback`

2. Add a custom rule to include groups (Actions > Flows > Login):

   ```javascript
   exports.onExecutePostLogin = async (event, api) => {
     const namespace = 'https://signalk.org'
     if (event.authorization) {
       api.idToken.setCustomClaim(
         `${namespace}/groups`,
         event.authorization.roles
       )
     }
   }
   ```

3. Configure Signal K:
   ```bash
   SIGNALK_OIDC_ENABLED=true
   SIGNALK_OIDC_ISSUER=https://your-tenant.auth0.com/
   SIGNALK_OIDC_CLIENT_ID=<from Auth0>
   SIGNALK_OIDC_CLIENT_SECRET=<from Auth0>
   SIGNALK_OIDC_GROUPS_ATTRIBUTE=https://signalk.org/groups
   ```

### Generic OIDC Provider

Any OIDC-compliant provider should work. Ensure:

1. The provider supports the Authorization Code flow with PKCE
2. You can obtain the **Issuer URL** (used for OIDC Discovery)
3. Groups are included in the ID token (or userinfo endpoint)

The Issuer URL should have a discovery document at:
`{issuer}/.well-known/openid-configuration`

## Auto-Login Mode

When `SIGNALK_OIDC_AUTO_LOGIN=true`, Signal K automatically redirects unauthenticated users to the OIDC provider instead of showing the login page.

This is useful when:

- OIDC is the only authentication method
- Signal K is behind a reverse proxy that handles authentication
- You want a seamless SSO experience

**Note**: Local login remains available at `/admin/#/login?local=true`

## Security Considerations

### PKCE (Proof Key for Code Exchange)

Signal K uses PKCE for all OIDC flows, providing protection against authorization code interception attacks. This is automatic and requires no configuration.

### State Parameter

A cryptographically random state parameter prevents CSRF attacks during the OAuth flow. The state is stored in an encrypted, HTTP-only cookie.

### Token Validation

ID tokens are validated by:

- Verifying the signature against the provider's JWKS
- Checking the issuer matches the configured issuer
- Verifying the audience contains the client ID
- Validating the token is not expired
- Verifying the nonce matches (prevents replay attacks)

### HTTPS Requirement

For production use, always run Signal K behind HTTPS. OIDC cookies are marked as `Secure` when accessed over HTTPS.

## Troubleshooting

### "OIDC discovery failed"

**Cause**: Signal K cannot reach the OIDC provider's discovery endpoint.

**Solutions**:

- Verify the issuer URL is correct
- Check network connectivity to the provider
- Ensure the discovery endpoint is accessible: `curl {issuer}/.well-known/openid-configuration`

### "Invalid redirect URI"

**Cause**: The callback URL doesn't match what's registered with the provider.

**Solutions**:

- Check the redirect URI registered with your provider
- Ensure it exactly matches: `https://your-server:3000/signalk/v1/auth/oidc/callback`
- For development, you may need to add `http://localhost:3000/...` as well

### "User has readonly permissions" (expected admin)

**Cause**: Groups aren't being mapped correctly.

**Solutions**:

1. Check the ID token contains groups:
   - Use browser developer tools to inspect the token
   - Or decode the JWT at [jwt.io](https://jwt.io)
2. Verify `groupsAttribute` matches your provider's claim name
3. Ensure the user is in a group listed in `adminGroups`
4. Some providers require explicit configuration to include groups in tokens

### "State mismatch" or "Invalid state"

**Cause**: The OIDC flow state was lost or expired.

**Solutions**:

- Ensure cookies are enabled in the browser
- Check if a reverse proxy is stripping cookies
- The state cookie expires after 10 minutes; restart the login flow

### Login redirects but user not authenticated

**Cause**: The callback is failing silently.

**Solutions**:

- Check Signal K server logs for OIDC errors
- Verify the client secret is correct
- Ensure the token endpoint is accessible from Signal K

## API Reference

### Login Endpoint

```
GET /signalk/v1/auth/oidc/login
```

Initiates the OIDC login flow. Redirects to the identity provider.

Query parameters:

- `returnTo` (optional): URL to redirect after successful login

### Callback Endpoint

```
GET /signalk/v1/auth/oidc/callback
```

Handles the OIDC callback from the identity provider. Not called directly by users.

### Login Status

```
GET /skServer/loginStatus
```

Returns the current authentication status including OIDC configuration:

```json
{
  "status": "loggedIn",
  "username": "oidc-user@example.com",
  "userLevel": "admin",
  "oidcEnabled": true,
  "oidcAutoLogin": false,
  "oidcLoginUrl": "/signalk/v1/auth/oidc/login",
  "oidcProviderName": "Corporate SSO"
}
```

### Admin Configuration API

```
GET /skServer/security/oidc
PUT /skServer/security/oidc
POST /skServer/security/oidc/test
```

Admin-only endpoints for managing OIDC configuration. See the OpenAPI documentation for details.
