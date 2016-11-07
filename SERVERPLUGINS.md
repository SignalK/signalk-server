# Server plugins

Signal K Node server plugins are components that run within the server and add some functionality to the server.

Plugin examples include
- [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) - reports your vessel's position and speed to http://www.marinetraffic.com/
- [Set System Time](https://github.com/tkurki/set-system-time) - sets your system time periodically based on time data received from gps
- [Conversion from Signal K to NMEA0183](https://github.com/SignalK/signalk-to-nmea0183)

Plugins
- are installed separately from an npm dependency (npm supports [GitHub hosted dependencies](https://docs.npmjs.com/files/package.json#github-urls))
- need usually configuration data delivered via a standard configuration UI
- can be enabled / disable via configuration UI

In essence a plugin is an npm module with `signalk-node-server-plugin` keyword in the `package.json`. They are installed as usual with `npm install`.

The module must export a single `function(app)` that must return an object with functions `start(configuration)` and `stop` and a field `schema`. The schema value should be the structure of the plugin's configuration data as [JSON Schema](http://json-schema.org/).

See [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) for an example.
