---
title: Security
children:
  - setup/generating_tokens.md
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
