# Signal K Server Tools

This directory contains utility scripts for testing and development.

## OIDC Test Scripts

These scripts test the OIDC authentication flow against a running Signal K server with OIDC configured.

### Prerequisites

- A running Signal K server with OIDC enabled
- An OIDC provider (Authelia, Keycloak, etc.) configured and accessible
- `curl` and `python3` installed
- Valid OIDC credentials

### test-oidc-flow.sh

Tests the complete OIDC authentication flow step by step:

1. Checks OIDC status on Signal K
2. Initiates OIDC login
3. Authenticates with the OIDC provider
4. Exchanges authorization code
5. Completes the callback
6. Verifies login status
7. Decodes the JWT token

```bash
./test-oidc-flow.sh -s https://signalk.local:3000 -p "password" -v

# With explicit auth URL and Keycloak
./test-oidc-flow.sh -s https://signalk.local:3000 \
    -a https://keycloak.local/realms/myrealm \
    --auth-type keycloak \
    -u admin -p "password"
```

### test-oidc-all.sh

Comprehensive test suite that tests:

- OIDC configuration status
- Login redirect functionality
- Full authentication flow
- Permission mapping (admin/readwrite/readonly)

```bash
./test-oidc-all.sh -s https://signalk.local:3000 -p "password"
```

### test-oidc-sso.sh

Tests Single Sign-On (SSO) functionality:

1. Authenticates directly with OIDC provider (simulating prior login)
2. Verifies session cookie is established
3. Initiates Signal K OIDC login
4. Verifies no re-authentication is required
5. Confirms user is logged in with correct permissions

```bash
./test-oidc-sso.sh -s https://signalk.local:3000 -p "password" -v
```

### Common Options

| Option                | Description                                       |
| --------------------- | ------------------------------------------------- |
| `-s, --signalk URL`   | Signal K server URL (required)                    |
| `-a, --auth URL`      | OIDC provider URL (auto-detected if not provided) |
| `-u, --username USER` | OIDC username (default: admin)                    |
| `-p, --password PASS` | OIDC password (required)                          |
| `-v, --verbose`       | Show verbose debug output                         |
| `-k, --insecure`      | Allow insecure SSL (self-signed certs)            |
| `--auth-type TYPE`    | Provider type: `authelia`, `keycloak`, `generic`  |

### Environment Variables

Instead of command-line options, you can use:

```bash
export SIGNALK_URL=https://signalk.local:3000
export AUTH_URL=https://auth.local
export AUTH_USERNAME=admin
export AUTH_PASSWORD=secret
export AUTH_TYPE=authelia

./test-oidc-flow.sh
```

### Output

All scripts save detailed output to `/tmp/oidc_test_<timestamp>/` or `/tmp/sso_test_<timestamp>/` including:

- HTTP headers from each step
- Response bodies
- Login status JSON
- Decoded JWT tokens

### Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed
- `2`: Tests passed but user has unexpected permission level

### Supported Providers

- **Authelia**: Full support with firstfactor API
- **Keycloak**: Form-based login support
- **Generic**: Basic flow (may require manual authentication)
