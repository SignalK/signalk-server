# OIDC Test Environment for Signal K

A minimal Authelia + Traefik setup for testing Signal K's OIDC authentication locally.

**WARNING**: This configuration uses static test secrets and is NOT secure for production use!

## Prerequisites

None! The `*.localhost` domains resolve to `127.0.0.1` automatically on most systems.

## Quick Start

1. **Start the environment**:

   ```bash
   cd tools/oidc-test-env
   docker compose up -d
   ```

2. **Verify Authelia is running**:

   ```bash
   curl -k https://auth.test.localhost/api/health
   ```

3. **Run Signal K** - choose one of these methods:

   **Option A: Local development server**

   ```bash
   NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
   ```

   Then configure OIDC via the admin UI or `security.json`.

   **Option B: Docker container** (for quick testing)

   ```bash
   docker run -d --name signalk-oidc-test \
     --network oidc-test-env_oidc-test \
     --add-host auth.test.localhost:$(docker inspect traefik-test --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}') \
     -p 3000:3000 \
     -e SIGNALK_OIDC_ENABLED=true \
     -e SIGNALK_OIDC_ISSUER=https://auth.test.localhost \
     -e SIGNALK_OIDC_CLIENT_ID=signalk \
     -e SIGNALK_OIDC_CLIENT_SECRET=signalk-test-secret \
     -e SIGNALK_OIDC_ADMIN_GROUPS=admins \
     -e SIGNALK_OIDC_AUTO_CREATE_USERS=true \
     -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
     ghcr.io/hatlabs/signalk-server:oidc-test
   ```

4. **Test the login flow** by navigating to http://localhost:3000 and clicking "Login with SSO"

## Test Users

| Username | Password | Groups | Description  |
| -------- | -------- | ------ | ------------ |
| admin    | test     | admins | Admin user   |
| user     | test     | (none) | Regular user |

## URLs

| Service           | URL                                                          |
| ----------------- | ------------------------------------------------------------ |
| Authelia          | https://auth.test.localhost                                  |
| Traefik Dashboard | http://localhost:8080                                        |
| OIDC Discovery    | https://auth.test.localhost/.well-known/openid-configuration |

## Signal K OIDC Configuration

Add to your Signal K `security.json`:

```json
{
  "oidc": {
    "issuer": "https://auth.test.localhost",
    "clientId": "signalk",
    "clientSecret": "signalk-test-secret"
  }
}
```

Or configure via the Signal K admin UI under Security > Authentication.

**Important**: Signal K must trust the self-signed certificate. Set `NODE_TLS_REJECT_UNAUTHORIZED=0` when running Signal K for testing.

## Verifying OIDC Setup

```bash
# Health check (accept self-signed cert with -k)
curl -k https://auth.test.localhost/api/health

# OIDC discovery document
curl -k https://auth.test.localhost/.well-known/openid-configuration
```

## Stopping the Environment

```bash
docker compose down

# To also remove the data volume:
docker compose down -v
```

## Troubleshooting

### Certificate errors in Signal K

Signal K needs to trust the self-signed certificate. For testing:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
```

### "Invalid redirect URI" error

The redirect URI must match one of the configured URIs in `authelia/configuration.yml`.
Pre-configured URIs:

- `https://signalk.test.localhost:3000/signalk/v1/auth/oidc/callback`
- `http://localhost:3000/signalk/v1/auth/oidc/callback`

If Signal K runs on a different port, update `authelia/configuration.yml`.

### "Invalid client credentials" error

The client secret must be exactly: `signalk-test-secret`

### Container won't start

Check logs:

```bash
docker compose logs authelia
docker compose logs traefik
```

### `*.localhost` doesn't resolve

On some older systems, `*.localhost` subdomains may not resolve automatically.
Add to `/etc/hosts`:

```
127.0.0.1 auth.test.localhost signalk.test.localhost
```

## Architecture

```
                    ┌─────────────────┐
                    │   Browser       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Traefik :443   │  (self-signed TLS)
                    │  auth.test.localhost
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Authelia :9091  │
                    │  (OIDC Provider)│
                    └─────────────────┘

Signal K runs separately on signalk.test.localhost:3000
```

## Why `test.localhost`?

- `*.localhost` domains resolve to `127.0.0.1` automatically (RFC 6761)
- `test.localhost` (with a period) satisfies Authelia's cookie domain requirement
- No `/etc/hosts` editing required on modern systems

## Files

- `docker-compose.yml` - Traefik and Authelia containers
- `traefik/traefik.yml` - Traefik static configuration
- `traefik/dynamic.yml` - Traefik routing to Authelia
- `authelia/configuration.yml` - Authelia configuration with OIDC client for Signal K
- `authelia/users_database.yml` - Test user accounts

## Security Notice

This test environment:

- Uses static, published secrets
- Uses self-signed TLS certificates
- Has debug logging enabled
- Should NEVER be exposed to the internet

For production deployments, see the [Authelia documentation](https://www.authelia.com/configuration/).
