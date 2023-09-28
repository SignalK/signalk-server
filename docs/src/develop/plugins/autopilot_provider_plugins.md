# Autopilot Provider plugins

_This document should be read in conjunction with the [SERVER PLUGINS](./server_plugin.md) document as it contains additional information regarding the development of plugins that implement the Signal K Autopilot API._

---

## Overview

The Signal K Autopilot API defines endpoints under the path `/signalk/v2/api/vessels/self/steering/autopilot` for issuing commands to and retrieving information from autopilot devices.

Requests made to the Signal K Server Autopilot API are checked and only if the requestor is authorised to perform the operation are they passed through to a **provider plugin** to complete the operation.

A **provider plugin** manages communication with the autopilot device and MUST implement the Autopilot API in accordance with its definition.

Adopting this approach aims to provide reliable operation, flexibility to cater for the features of specific devices and ensure all connected applications have a standard interface to access data and perform operations.


## Operation:

The Signal K Server handles all requests to `/signalk/v2/api/vessels/self/steering/autopilot`, where it performs an access control check before passing on the request to be actioned by a plugin implementing the Autopilot API.

_Note: The request received by the plugin will be the same as the request received by the server._

For a plugin to be considered an Autopilot Provider it MUST:
- Implement route handlers for ALL Autopilot API paths
- Accept all parameters and values as per the Autopilot API definition
- Operate in accordance with the Autopilot API definition 
- Provide responses accordance with the Autopilot API definition
- Populate the relevant Signal K data model paths as specified
- Manage communication with the autopilot device(s), sending commands and retrieving information.

