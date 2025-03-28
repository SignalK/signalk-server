
#### `app.streambundle.getBus(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for a Signal K path that will stream values from any context.

The `path` parameter is optional. If it is not provided the returned stream produces values for all paths.

Stream values are objects with the following structure:
```javascript
  {
    path: ...,
    value: ...,
    context: ...,
    source: ...,
    $source: ...,
    timestamp: ...
  }
```

_Example:_
```javascript
app.streambundle
  .getBus('navigation.position')
  .forEach(pos => app.debug(pos));

// output
{
  path: 'navigation.position',
  value: { longitude: 24.7366117, latitude: 59.72493 },
  context: 'vessels.urn:mrn:imo:mmsi:2766160',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129039,
    src: '43'
  },
  '$source': 'n2k-sample-data.43',
  timestamp: '2014-08-15T19:00:02.392Z'
}
{
  path: 'navigation.position',
  value: { longitude: 24.82365, latitude: 58.159598 },
  context: 'vessels.urn:mrn:imo:mmsi:2766140',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129025,
    src: '160'
  },
  '$source': 'n2k-sample-data.160',
  timestamp: '2014-08-15T19:00:02.544Z'
}
```

#### `app.streambundle.getSelfBus(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for path from the `vessels.self` context.

The `path` parameter is optional. If it is not provided the returned stream contains values for all paths.

_Example:_
```javascript
app.streambundle
  .getSelfBus('navigation.position')
  .forEach(pos => app.debug(pos));

// output
{
  path: 'navigation.position',
  value: { longitude: 24.7366117, latitude: 59.72493 },
  context: 'vessels.urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129039,
    src: '43'
  },
  '$source': 'n2k-sample-data.43',
  timestamp: '2014-08-15T19:00:02.392Z'
}
{
  path: 'navigation.position',
  value: { longitude: 24.7366208, latitude: 59.7249198 },
  context: 'vessels.urn:mrn:signalk:uuid:a9d2c3b1-611b-4b00-8628-0b89d014ed60',
  source: {
    label: 'n2k-sample-data',
    type: 'NMEA2000',
    pgn: 129025,
    src: '160'
  },
  '$source': 'n2k-sample-data.160',
  timestamp: '2014-08-15T19:00:02.544Z'
}
```

#### `app.streambundle.getSelfStream(path)`

Get a [Bacon JS](https://baconjs.github.io/) stream for a path in the `vessels.self` context.

The `path` argument is optional. If it is not provided the returned stream produces values for all paths.

_Note: This is similar to `app.streambundle.getSelfBus(path)`, except that the stream values contain only the `value` property from the incoming deltas._

_Example:_
```javascript
app.streambundle
  .getSelfStream('navigation.position')
  .forEach(pos => app.debug(pos));

// output

  my-signalk-plugin { longitude: 24.736677, latitude: 59.7250108 } +600ms
  my-signalk-plugin { longitude: 24.736645, latitude: 59.7249883 } +321ms
  my-signalk-plugin { longitude: 24.7366563, latitude: 59.7249807 } +174ms
  my-signalk-plugin { longitude: 24.7366563, latitude: 59.724980699999996 } +503ms
```


#### `app.streambundle.getAvailablePaths()`

Get a list of available full data model paths maintained by the server.

_Example:_
```javascript
app.streambundle.getAvailablePaths();

// returns
[
  "navigation.speedOverGround",
  "navigation.courseOverGroundTrue",
  "navigation.courseGreatCircle.nextPoint.position",
  "navigation.position",
  "navigation.gnss.antennaAltitude",
  "navigation.gnss.satellites",
  "navigation.gnss.horizontalDilution",
  "navigation.gnss.positionDilution",
  "navigation.gnss.geoidalSeparation",
  "navigation.gnss.type","navigation.gnss.methodQuality",
  "navigation.gnss.integrity",
  "navigation.magneticVariation",
]
```


### Resources API Interface




#### `app.resourcesApi.listResources(resource_type, params, provider_id?)`


---

---

### Exposing custom HTTP paths & OpenApi

Plugins are able to provide an API via a function called `registerWithRouter(router)`, which like the plugin's `start` and `stop` functions, will be called during plugin startup with an _Express_ router as the parameter.

The router will be mounted at `/plugins/<pluginId>` and you can use standard _Express_ _(`.get()` `.post()` `.use()`, etc)_ methods to add HTTP path handlers.

_Note: `GET /plugins/<pluginid>` and `POST /plugins/<pluginid>/configure` are reserved by server (see below)._

It should be noted that _Express_ does not have a public API for deregistering subrouters, so `stop` does not do anything to the router.

If a plugin does provide an API, it is strongly recommended that it provide an **OpenApi description** to document its operation.

Doing so promotes interoperability with other plugins / webapps by making it easy to find and use the functionality built into plugins. It is also a means to avoid duplication, promote reuse and the possibility of including them in the Signal K specification.

See [Server Plugins](server_plugin.md#add-an-openapi-definition) for details.

---

### Plugin configuration HTTP API

#### `GET /plugins/`

Get a list of installed plugins and their configuration data.

#### `GET /plugins/<pluginid>`

Get information from an installed plugin.

Example result:
```json
{
  "enabled": false,
  "id": "marinetrafficreporter",
  "name": "Marine Traffic Reporter"
}
```

#### `POST /plugins/<pluginid>/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.
