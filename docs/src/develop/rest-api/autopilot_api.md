# Autopilot API

#### (Under Development)

_Note: This API is currently under development and the information provided here is likely to change._

The Signal K server Autopilot API will provide a common set of operations for interacting with autopilot devices and (like the Resources API) will rely on a "provider plugin" to facilitate communication with the autopilot device.

The Autopilot API will handle requests to `/steering/autopilot` paths and pass them to an Autopilot Provider plugin which will send the commands to the autopilot device. 

The following operations are an example of the operations identified for implementation via HTTP `GET` and `PUT` requests:

PUT `/steering/autopilot/engage` (engage / activate the autopilot)

PUT `/steering/autopilot/disengage` (disengage / deactivate the autopilot)

GET `/steering/autopilot/state` (retrieve the current autopilot state)

PUT `/steering/autopilot/state` (set the autopilot state)

GET `/steering/autopilot/mode` (retrieve the current autopilot mode)

PUT `/steering/autopilot/mode` (set autopilot mode)

GET `/steering/autopilot/target` (get currrent target value)

PUT `/steering/autopilot/target` (set the target value based on the selected mode)

PUT `/steering/autopilot/target/adjust` (increment / decrement target value)

PUT `/steering/autopilot/tack/port` (perform a port tack)

PUT `/steering/autopilot/tack/starboard` (perform a starboard tack)



[View the PR](https://github.com/SignalK/signalk-server/pull/1596) for more details.

