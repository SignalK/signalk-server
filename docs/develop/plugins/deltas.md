---
title: Processing Data
---

# Processing data from the server

A plugin will generally want to:
1. Subscribe to data published by the server _(i.e. received from a NMEA 2000 bus, etc)_
1. Emit data.

In both cases the plugin will use *deltas* which the server uses to signal changes in the Signal K full data model. Delta messages contain the new value associated with a path (not the amount of change from the previous value.)_

_See the [Signal K Delta Specification](http://signalk.org/specification/1.7.0/doc/data_model.html#delta-format) for details._

Using the server API, plugins can either:
1. Get the current value of a path in the full model or
1. Subscribe to a path and access a stream of _deltas_ that updates every time the value is updated.

By specifying a context _e.g. 'vessels.self'_ you can limit the number of delta messages received to those of host vesseel.
To receive all deltas you can specify `*` as the context.

You can also limit the deltas received by the path you supply.
If you supply a specific path _e.g. navigation.position_, only updates in the value will be received.
Since paths are hierarchical, paths can contain wildcards _e.g._navigation.*_ which will deliver deltas containing updates to all paths under `navigation`.

The data received is formatted as per the following example:
```javascript
  {
    path: 'navigation.position',
    value: { longitude: 24.7366117, latitude: 59.72493 },
    context: 'vessel.self',
    source: {
        label: 'n2k-sample-data',
        type: 'NMEA2000',
        pgn: 129039,
        src: '43'
    },
    $source: 'n2k-sample-data.43',
    timestamp: '2014-08-15T19:00:02.392Z'
  }
```


## Reading the current path value

The server API provides the following methods for retrieving values from the full data model.
- `getSelfPath(path)` returns the value of the supplied `path` in the `vessels.self` context.
```javascript
const value = app.getSelfPath('uuid');
app.debug(value); // Should output something like urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60
```

- `getPath(path)` returns the value of the path (including the context) starting from the _root_ of the full data model.
```javascript
const baseStations = app.getPath('shore.basestations');
```

## Subscribing to Deltas

A can subscribe to a stream of updates (deltas) by creating the subscription.

Subcriptions are generally manged in the plugin `start()` and `stop()` methods to ensure the subscribtions are _unsubscribed_ prior to the plugin stopping to ensure all resources are freed.

The following example illustrates the pattern using the {@link @signalk/server-api!ServerAPI.subscriptionmanager | `subscriptionmanager`} API method.

```javascript
let unsubscribes = [];

plugin.start = (options, restartPlugin) => {
  app.debug('Plugin started');
  let localSubscription = {
    context: '*', // Get data for all contexts
    subscribe: [{
      path: '*', // Get all paths
      period: 5000 // Every 5000ms
    }]
  };

  app.subscriptionmanager.subscribe(
    localSubscription,
    unsubscribes,
    subscriptionError => {
      app.error('Error:' + subscriptionError);
    },
    delta => {
      delta.updates.forEach(u => {
        app.debug(u);
      });
    }
  );
};

plugin.stop = () => {
  unsubscribes.forEach(f => f());
  unsubscribes = [];
};
```

In the `start()` method create a subscription definition `localSubscription` which is then passed to `app.subscriptionmanager.subscribe()` as the first argument, we also pass the `unsubscribes` array in the second argument.

The third argument is a function that will be called when there's an error.

The final argument is a function that will be called every time an update is received.

In the `stop()` method each subcription in the `unsubscribes` array is _unsubscribed_ and the resources released.

## Sending Deltas

A SignalK plugin can not only read deltas, but can also send them. This is done using the `handleMessage()` API method and supplying:

1. The plugin id
2. A formatted delta update message
3. The Signal K version ['v1' or 'v2'] _(if omitted the default is 'v1')_. See [REST APIs](../rest-api/README.md) for details.

_Example:_
```javascript
app.handleMessage(
    plugin.id,
    {
        updates: [{
            values: [{
                path: 'environment.outside.temperature',
                value: -253
            }]
        }]
    },
    'v1'
  );
```


## Sending NMEA 2000 data from a plugin

A SignalK plugin can not only emit deltas, but can also send data such as NMEA 2000 data.

This is done using the `emit()` API and specifying the provider as well as the formatted data to send.

_Example: Send NMEA using Actisense serial format:_
``` javascript
  app.emit(
    'nmea2000out',
    '2017-04-15T14:57:58.468Z,0,262384,0,0,14,01,0e,00,88,b6,02,00,00,00,00,00,a2,08,00');
```

_Example: Send NMEA using Canboat JSON format:_
```javascript
  app.emit('nmea2000JsonOut', {
    pgn: 130306,
    'Wind Speed': speed,
    'Wind Angle': angle < 0 ? angle + Math.PI*2 : angle,
    'Reference': "Apparent"
  });
```

### Sending a message on NMEA2000 startup

If you need to send an NMEA2000 message out at startup, _e.g get current state from a device_ you will need to wait until the provider is ready before sending your message.

_Example: Send NMEA after the provider is ready:_
```javascript
  app.on('nmea2000OutAvailable', () => {
     app.emit(
       'nmea2000out',
       '2017-04-15T14:57:58.468Z,2,6,126720,%s,%s,4,a3,99,01,00');
  });
```
