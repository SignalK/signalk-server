# Server plugins

Signal K Node server plugins are components that run within the server and add some functionality to the server.

Plugin examples include
- [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) - reports your vessel's position and speed to http://www.marinetraffic.com/
- [Set System Time](https://github.com/tkurki/set-system-time) - sets your system time periodically based on time data received from gps
- [Conversion from Signal K to NMEA0183](https://github.com/SignalK/signalk-to-nmea0183)
- [Writing Signal K data to InfluxDb](https://github.com/tkurki/signalk-to-influxdb) (a database for time series)
- [Zones](https://github.com/SignalK/signalk-zones) - defines ranges for a data item's value and fire notifications when the value is within the range

Plugins
- are installed separately from an npm dependency (npm supports [GitHub hosted dependencies](https://docs.npmjs.com/files/package.json#github-urls))
- need usually configuration data delivered via a standard configuration UI
- can be enabled / disable via configuration UI

In essence a plugin is an npm module with `signalk-node-server-plugin` keyword in the `package.json`. They are installed as usual with `npm install`.

The module must export a single `function(app)` that must return an object with functions `start(configuration)` and `stop` and a field `schema`. The schema value should be the structure of the plugin's configuration data as [JSON Schema](http://json-schema.org/).

See [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) for an example.

##HTTP API

###`GET /plugins/`

List of installed plugins with their configuration data.

###`GET /plugins/<pluginid`

```
{
	"enabled": false,
	"id": "marinetrafficreporter",
	"name": "Marine Traffic Reporter"
}
```

###`POST /plugins/<pluginid/configure`

Save configuration data for a plugin. Stops and starts the plugin as a side effect.
