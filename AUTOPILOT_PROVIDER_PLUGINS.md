# Autopilot Provider plugins

_This document should be read in conjunction with [SERVERPLUGINS.md](./SERVERPLUGINS.md) as it contains additional information regarding the development of plugins that facilitate the sending and retrieval of data to autopilot devices._

To see an example of a resource provider plugin see [mock-autopilot-provider](./packages/mock-autopilot-provider)

---

## Overview

The Signal K Autopilot API provides endpoints under the path `/signalk/v2/api/vessels/self/steering/autopilot` for issuing commands to and retrieving information from autopilot devices.

Whilst the Signal K server does implement the Autopilot API, it relies on __Autopilot Providers__ to manage communication with specific autopilot devices.

The de-coupling of request handling and autopilot control provides flexibility to integrate the features of specific devices.

_Note: An Autopilot Provider plugin can act as a provider for either: a specific device or a family of devices that share a common feature / command set._

---
## Server Operation:

The Signal K server handles requests to `/signalk/v2/api/vessels/self/steering/autopilot` (and sub-paths), before passing on the request to the registered autopilot provider plugin.

The following operations are performed by the server when a request is received:
- Checks for a registered autopilot provider
- Checks that the required AutopilotProvider methods are defined
- Performs access control check

Only after successful completion of all these operations is the request  passed on to the registered autopilot provider plugin.

---
## Autopilot Provider plugin:

For a plugin to be considered an Autopilot Provider it needs to register with the SignalK server the methods used to action requests. It is these methods that perform the sending of commands and retrieval aof information from the autopilot device.


### Autopilot Provider Interface

---
The `AutopilotProvider` interface is the means by which the plugin informs the SignalK server that it services and autopilot device and that Autopilot API requests should be passed to it. 

The `AutopilotProvider` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface AutopilotProvider {
  pilotType: string
  methods: AutopilotProviderMethods
}
```
where:

- `pilotType`: A string ifdentifying the autopilot device provided for by the plugin _(e.g. 'PyPilot')_.

- `methods`: An object implementing the `AutopilotProviderMethods` interface defining the functions to which requests are passed by the SignalK server. _Note: The plugin __MUST__ implement each method, even if that operation is NOT supported by the plugin!_

The `AutopilotProviderMethods` interface is defined as follows in _`@signalk/server-api`_:

```typescript
interface AutopilotProviderMethods {
  getConfig: () => Promise<{ [key: string]: any }>
  setState: (state: string) => Promise<void>
  engage: (enable: boolean) => Promise<void>
  setMode: (mode: string) => Promise<void>
  setTarget: (value: number) => Promise<void>
  adjustTarget: (value: number) => Promise<void>
  tack: (port: boolean) => Promise<void>
}
```


### Methods and Autopilot Provider Implementation:

---
**The Autopilot Provider is responsible for implementing the methods and returning data in the required format!**

---

__`getConfig():`__ Object contining `key | value` pairs repesenting both:
- Valid option values for `state` and ` mode`
- Current values for `state`, ` mode` and `target`

returns: `Promise<{[key: string]: any}>`

_Example response:_
```JSON
{
  "options":{
    "state":["enabled","disabled"],
    "mode":["gps","compass","wind"]
  },
  "state":"disabled",
  "mode":"gps",
  "target": 0
}
```

---
__`setState(value)`__: This method is called when a request is made to send a command to the autopilot device to set its `state` to a specified `value`.
Method should `throw` or return `Promise.reject` on failure.

- `value`: String containing a valid `state`. _(e.g. 'enabled')_

returns: `Promise<void>`

---
__`engage(enable)`__: This method is an alias for `setState()` which does not require the caller to know the valid values for `mode`, but rather just specify the value of enable as either `true` or `false`.

The method will substitue the appropriate valid `mode` value to either enable or disable the autopilot device.
Method should `throw` or return `Promise.reject` on failure.

- `value`: String containing a valid `state`. _(e.g. 'enabled')_

returns: `Promise<void>`

---
__`setMode(value)`__: This method is called when a request is made to send a command to the autopilot device to set its `mode` to a specified `value`.
Method should `throw` or return `Promise.reject` on failure.

- `value`: String containing a valid `mode`. _(e.g. 'gps')_

returns: `Promise<void>`

---
__`setTarget(value)`__: This method is called when a request is made to send a command to the autopilot device to set its `target` to a specified `value`.
Method should `throw` or return `Promise.reject` on failure.

- `value:` Target value to set in radians.

returns: `Promise<void>`


---
__`adjustTarget(value)`__: This method is called when a request is made to send a command to the autopilot device to set its `target` to <current target value> + `value`.
Method should `throw` or return `Promise.reject` on failure.

- `value:` Value to set in radians to add to current `target` value.

returns: `Promise<void>`

---
__`tack(port)`__: This method is called when a request is made to send a command to the autopilot device to tack in a specified direction:
- `port = true`: 
Method should `throw` or return `Promise.reject` on failure.

- `port:` `true` = Tack to Port, `false` = Tack to Starboard.

returns: `Promise<void>`


### Registering an Autopilot Provider:
---

To register a plugin as an Autopilot provider with the SignalK server, it must call the server's `registerAutopilotProvider` function during plugin startup. 

The function has the following signature:

```typescript
app.registerAutopilotProvider(autopilotProvider: AutopilotProvider)
```
where:
- `autopilotProvider`: is a reference to a `AutopilotProvider` object containing the __pilotType__ and __methods__ to receive the requests.

_Note: Only one plugin can be registered and active as an Autopilot provider._

**AutopilotProvider Methods:**

The AutopilotProvider object must implement methods to service the requests passed from the server.

All methods must be implemented even if the plugin does not provide for a specific request.

Each method should return a __Promise__ on success and `throw` on error or if a request is not serviced.

_Example:_
```javascript
// SignalK server plugin 
module.exports = function (app) {

  const plugin = {
    id: 'mypluginid',
    name: 'My Autopilot Provider plugin',
    // plugin start handler function
    start: options => { 
      ... 
      // Register as Autopilot Provider
      app.registerResourceProvider({
        pilotType: 'myPilot',
        methods: {  // Implement Autopilot Provder methods
          getConfig: () => {
            console.log(`${plugin.id} => getConfig()`)
            return Promise.resolve(apConfig)
          },
          engage: (enable: boolean): Promise<void> => {
            console.log(`${plugin.id} => engage(${enable})`)
            apSetState(enable ? 'enabled' : 'disabled')
            return Promise.resolve()
          },
          setState: (state: string): Promise<void> => {
            return apSetState(state)
          },
          setMode: (mode: string): Promise<void> => {
            return apSetMode(mode)
          },
          setTarget: (value: number): Promise<void> => {
            console.log(`${plugin.id} => setTarget(${value})`)
            return apSetTarget(value)
          },
          adjustTarget: (value: number): Promise<void> => {
            console.log(`${plugin.id} => adjustTarget(${value})`)
            return apSetTarget(apConfig.target + value)
          },
          // not serviced
          tack: (port: boolean): Promise<void> => {
            throw( new Error('Not implemented!')) 
          }
        }
      })
    }
  }
}
```
