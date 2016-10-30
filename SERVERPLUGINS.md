# Server plugins

Signal K Node server plugins are components that run within the server and add some functionality to the server.

Plugin examples include
- [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) - reports your vessel's position and speed to http://www.marinetraffic.com/
- Set System Time - sets your system time periodically based on time data received from gps
- Conversions: for example magnetic heading from NMEA0183 to NMEA2000

Plugins
- are installed separately from an npm dependency
- need usually configuration data delivered via a standard configuration UI
- can be enabled / disable via configuration UI

In essence a plugin is an npm module with `signalk-node-server-plugin` keyword in the `package.json`. They are installed as usual with `npm install`. The module must export a single `function(app)` that must return an object with functions `start(configuration)` and `stop` and a field `schema`. The schema value should be the plugin's configuration data's structure as [JSON Schema](http://json-schema.org/).

See [MarineTraffic Reporter](https://github.com/tkurki/marinetrafficreporter) for an example.
