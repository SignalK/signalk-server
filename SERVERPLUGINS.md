# Server plugins

Signal K Node server plugins are components that run within the server and add some functionality to the server. Their configuration is done via web forms accessible from the root of the Node server.

Plugin examples include
- [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) - reports your vessel's position and speed to http://www.marinetraffic.com/
- [Set System Time](https://github.com/tkurki/set-system-time) - sets your system time periodically based on time data received from gps
- [Conversion from Signal K to NMEA0183](https://github.com/SignalK/signalk-to-nmea0183)
- [Writing Signal K data to InfluxDb](https://github.com/tkurki/signalk-to-influxdb) (a database for time series)
- [Zones](https://github.com/SignalK/signalk-zones) - defines ranges for a data item's value and fire notifications when the value is within the range
- [ws-provider](https://github.com/SignalK/ws-provider-plugin) - allows the server to connect to discovered or configured Signal K servers/gateways, for example the iKommunicate
- [signalk-push-notifications](https://github.com/sbender9/signalk-push-notifications) - plugin that pushes SignalK notifications to Amazon SNS
- [signalk-to-nmea2000](https://github.com/sbender9/signalk-to-nmea2000) - convert Signal K to NMEA2000
- [signalk-ifttt-notifications](https://github.com/sbender9/signalk-ifttt-notifications) - Trigger ifttt actions when SignalK notifications are fired
- [signalk-n2kais-to-nmea0183](https://github.com/sbender9/signalk-n2kais-to-nmea0183) - converts NMEA2000 AIS messages to NMEA0183

Plugins
- are installed separately from an npm dependency (npm supports [GitHub hosted dependencies](https://docs.npmjs.com/files/package.json#github-urls))
- need usually configuration data delivered via a standard configuration UI
- can be enabled / disable via configuration UI

In essence a plugin is an npm module with `signalk-node-server-plugin` keyword in the `package.json`. They are installed as usual with `npm install` or using the app store.

To keep a plugin off of the app store, also add the `signalk-node-server-no-appstore` keyword to the package.

The module must export a single `function(app)` that must return an object with functions `start(configuration)` and `stop` and a field `schema`. The schema value should be the structure of the plugin's configuration data as [JSON Schema](http://json-schema.org/).

See [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) for an example.

## HTTP API

### `GET /plugins/`

List of installed plugins with their configuration data.

### `GET /plugins/<pluginid`

```
{
	"enabled": false,
	"id": "marinetrafficreporter",
	"name": "Marine Traffic Reporter"
}
```

### `POST /plugins/<pluginid/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.
