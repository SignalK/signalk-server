---
title: Security
children:
  - setup/generating_tokens.md
  - oidc.md
---

# Security

The umbrella term _Security_ in Signal K server refers to the difference between running a server, that any one connected to the network can access and alter at will **(unsecured)** , and one with restrictions in place **(secured)**.

The available security options relate to:

- **authentication**: Users and / or connecting devices having to provide a credential to gain access to the server _(e.g. username & password, access token, etc.)_.
- **access control**: Based on the authentication, access is granted to only specific Signal K data and server configuration.
- **communications**: Network traffic is encrypted and the identity of the server verified to protect against eavesdropping.
- **network services**: Control which of the server's services/interfaces are configured and active _(e.g. does it allow unsecured read/write over the network)_.

## Enabling Security

When Signal K Server does not have security enabled, the `Login` option at the top right corner of the Admin UI will not be available.

Security can be enabled in several ways:

1. Using the Admin UI, select _Security -> Users_ and then:
   - Click **Add**
   - Enter a **user id**
   - Enter a **password** and confirm it
   - In **Permissions** select **Admin**
   - Click **Apply**.
   - Restart the Signal K Server.

2. Starting the server with the `--securityenabled` command line option
3. Adding the following section in the settings file

```JSON
"security": {
    "strategy": "./tokensecurity",
  }
```

When security is enabled, the next time you access the Admin UI it will prompt you to create an administrator account.

Security configuration is stored in file called `security.json` which will be located in the server configuration directory.

## Disabling Security / Lost Admin Credentials

In case the administrator user credentials are lost, removing the `security.json` file and restarting the server will restore access to the Admin UI.

## Access Control

Access control lists _(acls)_ allow for fine grained access to specific data in Signal K. They specify the permissions assigned to users for resources within specifc contexts and are defined within the `security.json` file.

The following example defines acls for the self context allowing:

1. Anyone to read the paths `"steering.*"`, `"navigation.*"`, `"name"`, `"design.aisShipType"` and grants the admin user permission to write (update) those paths.

2. The user _john_ to read any data coming from the `actisense.35` $source.

3. For all other paths, only the admin user to read and no one can write.

```JSON
  "acls": [
    {
      "context": "vessels.self",
      "resources": [
        {
          "paths": ["steering.*", "navigation.*", "name", "design.aisShipType"],
          "permissions": [
            {
              "subject": "any",
              "permission": "read"
            },
            {
              "subject": "admin",
              "permission": "write"
            }
          ]
        },
        {
          "sources": [ "actisense.35" ],
          "permissions": [
            {
              "subject": "john",
              "permission": "read"
            }
          ]
        },
        {
          "paths": ["*"],
          "permissions": [
            {
              "subject": "admin",
              "permission": "read"
            }
          ]
        }
      ]
    }
  ]
```

_Note: If there is no match is found for a specific path in the acl list, then permission will be denied to that path!_

## Active network services

Signal K Server's main network services are:

- The _primary Signal K http / WebSocket interface_, with options to use TLS encryption and authentication _(read/write)_
- _NMEA0183 data over TCP_ on port 10110 _(read only)_
- _Signal K over TCP_ on port 8375 _(read/write)_

In addition the user may configure any number of TCP, UDP and Websocket connections, some of which allow write access to the server.

The security implication of these connections is that with no security options turned on _devices connected to the network will have both read and write access to practically all of its data and settings_.

People often dismiss local network access by saying that their boat's local network is secure enough. But one very common scenario is connecting your Signal K server _(e.g. a Raspberry Pi)_ to a marina wifi.
Many wifi networks allow communication between all connected computers, so your Signal K server will be advertising its services over MDNS to all other connected devices.

So in the case that your server has a manually configured connection for _NMEA0183 over UDP_, NMEA0183 data broadcast by other devices will be received and written into your SIgnal K data.

NMEA0183 connections over TCP and UDP are inherently unsafe. There are no options for authentication and / or secure communication. In comparison Signal K over TLS and HTTP / WebSockets can provide secure, authenticated read and write access to your data.

## Security Headers

Signal K Server uses the `helmet` middleware to set security-related HTTP headers:

| Header                            | Value            | Purpose                                            |
| --------------------------------- | ---------------- | -------------------------------------------------- |
| X-Content-Type-Options            | nosniff          | Prevents MIME type sniffing attacks                |
| X-Frame-Options                   | SAMEORIGIN       | Prevents clickjacking (allows same-origin iframes) |
| X-DNS-Prefetch-Control            | off              | Privacy protection                                 |
| X-Download-Options                | noopen           | Prevents IE from executing downloads               |
| X-Permitted-Cross-Domain-Policies | none             | Blocks Flash/PDF cross-domain access               |
| Referrer-Policy                   | no-referrer      | Privacy protection                                 |
| Strict-Transport-Security         | max-age=15552000 | Forces HTTPS (only sent on HTTPS connections)      |

### Intentionally Disabled

The following helmet features are disabled to maintain compatibility with the SignalK ecosystem:

- **Content-Security-Policy**: Would prevent webapps (Freeboard, Instrumentpanel) from loading external resources like map tiles and CDN scripts
- **Cross-Origin-Embedder-Policy**: Would prevent chart plotters from embedding SignalK data
- **Cross-Origin-Resource-Policy**: Would prevent legitimate cross-origin API access from instruments and apps

## Reverse Proxy Configuration (Trust Proxy)

When running Signal K Server behind a reverse proxy (e.g., nginx, Apache, Traefik), the server needs to be configured to trust the `X-Forwarded-For` header to correctly identify client IP addresses.

### Why Enable Trust Proxy?

Without this setting, when behind a reverse proxy:

- All requests appear to come from the proxy's IP (e.g., `127.0.0.1`)
- Rate limiting becomes ineffective (limits apply to proxy, not individual clients)
- Access logs show proxy IP instead of real client IP

When `trustProxy` is enabled, Signal K uses the `X-Forwarded-For` header (set by your proxy) to identify the real client IP address.

### Configuration

The `trustProxy` setting can be enabled in the Admin UI under **Server Settings > Options > trustProxy**.

For most setups behind a local reverse proxy, simply enabling `trustProxy: true` in the Admin UI is sufficient.

For advanced configurations (specific proxy IPs, hop counts), edit `settings.json` directly:

```json
{
  "settings": {
    "trustProxy": "127.0.0.1"
  }
}
```

The `trustProxy` setting accepts the following values:

| Value           | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `true`          | Trust all proxies (use with caution)                                     |
| `false`         | Don't trust any proxy (default)                                          |
| `"loopback"`    | Trust loopback addresses (127.0.0.1, ::1)                                |
| `"linklocal"`   | Trust link-local addresses                                               |
| `"uniquelocal"` | Trust unique local addresses                                             |
| Number          | Trust the first N proxies                                                |
| IP/CIDR         | Trust specific proxy addresses (e.g., `"192.168.1.1"` or `"10.0.0.0/8"`) |

### Example: nginx Reverse Proxy

When using nginx as a reverse proxy, configure it to pass the client IP:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
}
```

And set `trustProxy` to trust only the nginx server:

```json
{
  "settings": {
    "trustProxy": "127.0.0.1"
  }
}
```

### Security Considerations

- Only enable `trustProxy` if you are actually running behind a reverse proxy
- Configure the value to trust only your specific proxy IP address when possible
- Using `trustProxy: true` trusts all proxies, which could allow IP spoofing if your server is directly accessible

## OpenID Connect (OIDC) Authentication

Signal K Server supports OpenID Connect (OIDC) for Single Sign-On (SSO) with enterprise identity providers such as Keycloak, Authentik, Auth0, and others.

### Quick Configuration

OIDC can be enabled via environment variables:

```bash
export SIGNALK_OIDC_ENABLED=true
export SIGNALK_OIDC_ISSUER=https://auth.example.com
export SIGNALK_OIDC_CLIENT_ID=signalk-server
export SIGNALK_OIDC_CLIENT_SECRET=your-client-secret
```

Or through the Admin UI under **Security > OIDC Configuration**.

### Key Features

- **Single Sign-On**: Authenticate once with your identity provider
- **Group-Based Permissions**: Map identity provider groups to Signal K permissions (admin, readwrite, readonly)
- **Auto-Provisioning**: Automatically create Signal K users on first OIDC login
- **PKCE Security**: Protection against authorization code interception attacks

### Permission Mapping

Configure group-to-permission mapping:

```bash
# Users in these groups get admin access
export SIGNALK_OIDC_ADMIN_GROUPS=admins,sk-admin

# Users in these groups get read/write access
export SIGNALK_OIDC_READWRITE_GROUPS=crew,operators

# Default permission for users not in any configured group
export SIGNALK_OIDC_DEFAULT_PERMISSION=readonly
```

For complete setup instructions, provider-specific guides, and troubleshooting, see the [OIDC Authentication Guide](oidc.md).
