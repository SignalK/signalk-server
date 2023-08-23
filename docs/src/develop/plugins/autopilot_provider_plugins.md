# Autopilot Provider Plugins

#### (Under Development)

_Note: This API is currently under development and the information provided here is likely to change._


The Signal K server [Autopilot API](../rest-api/autopilot_api.md) will provide a common set of operations for interacting with autopilot devices and (like the Resources API) will rely on a "provider plugin" to facilitate communication with the autopilot device.

By de-coupling the operation requests from device communication provides the ability to support a wide variety of devices.

[View the PR](https://github.com/SignalK/signalk-server/pull/1596) for more details.
