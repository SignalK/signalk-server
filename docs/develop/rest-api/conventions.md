---
title: API Conventions
---

# Signal K REST API Conventions


## Overview

This document outlines the conventions used when defining Signal K REST APIs.

- Managing Configuration 
- Multiple Devices
- Multiple Providers


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
-  `_providers` path parameter
-  `provider` query parameter.


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
