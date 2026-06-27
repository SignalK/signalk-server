---
title: API Conventions
---

# Signal K REST API Conventions

## Overview

This document outlines the conventions used when defining Signal K REST APIs.

- Managing Configuration
- Multiple Devices
- Multiple Providers
- Schemas and Documentation

---

### Managing Configuration

APIs that provide configuration operations should provide operations under the `_config` path parameter.

_Example: Set **apiOnly** mode in Course API_

```shell
HTTP POST "/signalk/v2/api/vessels/self/course/_config/apiOnly"
```

_Example: Clear **apiOnly** mode in Course API_

```shell
HTTP DELETE "/signalk/v2/api/vessels/self/course/_config/apiOnly"
```

---

### Multiple Devices

When an API supports the installation of multiple devices _(e.g. autopilots, radars, etc)_ it can designate one device to receive commands if a specific device / provider is not targeted.

This done by using the `_default` parameter in the request path in place of the device identifier.

_Example: Engage the default autopilot_

```shell
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilots/_default/engage"
```

_Example: Engage a specific autopilot_

```shell
HTTP POST "/signalk/v2/api/vessels/self/steering/autopilots/raymarine-n2k/engage"
```

_Example: Retrieve the status of the default autopilot_

```shell
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilots/_default"
```

_Example: Retrieve the status of a specific autopilot_

```shell
HTTP GET "/signalk/v2/api/vessels/self/steering/autopilots/raymarine-n2k"
```

---

### Multiple Providers

Some APIs support the use of one or more _providers_ to provide:

- An aggregated set of data from varied sources _(e.g. resources)_
- The ability to interact with one or more services _(e.g. Weather providers)_

In these scenarios it is often required to perform operations to manage or target a provider.

Provider specific operations can use either the:

- `_providers` path parameter
- `provider` query parameter.

_Example: Retrieve the default provider servicing charts resources_

```shell
HTTP GET "/signalk/v2/api/resources/charts/_providers/_default"
```

_Example: Set the provider to handle creating new chart sources._

```shell
HTTP POST "/signalk/v2/api/resources/charts/_providers/_default/my-chart-plugin"
```

_Example: Create a new waypoint using the specified provider._

```shell
HTTP POST "/signalk/v2/api/resources/waypoints?provider=my-plugin-id"
```

---

### Schemas and Documentation

An API's data shapes are described by **TypeBox schemas**, which are the single source of truth. Each request / response shape is defined once in `packages/server-api/src/typebox/<name>-schemas.ts` and reused everywhere else:

- The **OpenAPI** specification (`src/api/<name>/openApi.ts`, browsable at `/doc/openapi/`) is generated from the schemas — paths reference them, the shapes are not written out by hand.
- The **AsyncAPI** specification for any WebSocket channels (`src/api/<name>/asyncApi.ts`) references the same schemas.
- Incoming request bodies and path / query parameters are **validated** against the schemas at runtime.
- The TypeScript types that plugins program against are derived from the schemas, so they cannot drift from what the server validates.

Because the OpenAPI and AsyncAPI specifications are generated, they stay in step with the schemas automatically. The one surface that is written by hand — and therefore the one to update whenever an API changes — is the **narrative documentation** for the API under `docs/develop/rest-api/`. Keep it describing current behaviour, and avoid hard-coding values (timeouts, limits) that will fall out of sync as the implementation evolves.

---
