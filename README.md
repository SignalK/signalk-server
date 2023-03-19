![Signal K logo](https://user-images.githubusercontent.com/5200296/226164888-d33b2349-e608-4bed-965f-ebe4339b4376.png)

[![npm version](https://badge.fury.io/js/signalk-server.svg)](https://badge.fury.io/js/signalk-server)
[![npm license](https://img.shields.io/npm/l/signalk-server.svg)](https://www.npmjs.com/package/signalk-server)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

![Open Collective backers and sponsors](https://img.shields.io/opencollective/all/signalk)



An implementation of a [Signal K](http://signalk.org) server in Node.js. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO).

The server multiplexes data from NMEA0183, NMEA 2000, Signal K and sensor inputs (eg. I2C connected sensors) and provides the data in Signal K format over HTTP, WebSocket and TCP. It also functions as a NMEA0183 server over TCP.

The server's capabilities can be expanded with the help of plugins that provide additional features such as
* conversion to NMEA2000
* conversion to NMEA0183
* read and write interfacing with cloud services such as MarineTraffic
* logging to database such as InfluxDb


# Installation

Detailed instructions for [installation on Raspberry Pi](https://github.com/SignalK/signalk-server-node/blob/master/raspberry_pi_installation.md)

Prerequisites
* Node.js version 16 with latest npm installed (the server works for the time being on Node version >=10, but we are moving to the latest LTS version that is v16 in 9/2021)

## Use: Install from npm

    $ sudo npm install -g signalk-server

Now you can start the server with sample data:
* NMEA0183 sample data: `signalk-server --sample-nmea0183-data`
* NMEA2000 sample data: `signalk-server --sample-n2k-data`

To generate your own vessel settings file and configure your Pi to start the server automatically run

    $ sudo signalk-server-setup

## Develop: Install from git

```
git clone https://github.com/SignalK/signalk-server.git
cd signalk-server
npm install
npm run build:all
```

Start the server with sample data:
* NMEA0183 sample data: `bin/nmea-from-file`
* NMEA2000 sample data: `bin/n2k-from-file`

This will start the server with a sample configuration file and the server will start playing back data from a sample file under `samples/`. The data is available immediately via the REST interface at https://localhost:3000/signalk/v1/api/.

A simple way to connect to the WebSocket interface from the command line is to install wscat2 and use that:
```
npm install -g wscat2
wscat 'ws://localhost:3000/signalk/v1/stream?subscribe=all'
```

## Provision: Ansible on a Raspberry Pi

[Marinepi-provisioning](https://github.com/tkurki/marinepi-provisioning) has useful roles and examples for provisioning Signal K and auxiliary services on a headless Raspberry Pi.


## Docker

You can start a local server on port 3000  with demo data with

```
docker run --init -it --rm --name signalk-server --publish 3000:3000 --entrypoint /home/node/signalk/bin/signalk-server signalk/signalk-server --sample-nmea0183-data
```

For real use you need to persist /home/node/.signalk where the server's configuration is stored, with for example

```
docker run -d --init  --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk signalk/signalk-server
```
This will run the server as background process and current directory as the settings directory. You will be prompted to create admin credentials the first time you you access the configuration admin web UI.

More docker information can found from [docker](docker/) -folder


Now what?
---------

Once you have the data streams in place you probably want to use the data or at least see it in a nice format. Some sample plugins and apps are installed during the installation process.
- Apps or Webapps are mainly web pages for accessing the Signal K output such as dashboards, configurable gauges or web maps. See [Webapps doc](https://github.com/SignalK/signalk-server-node/blob/master/WEBAPPS.md) for more information.
- If you have internet connectivity for your server App Store in the admin user interfaces shows all the Signal K Plugins and Apps that have been published via npm with the right keywords. It also shows their current status on your server and allows you to install and update these.
- Plugins are web forms to tailor your server to your needs, change parameters or get information from various sources. See [Server Plugins](SERVERPLUGINS.md)

Configuration
=============

Please take a look at the different settings files in the `settings` directory and read the [brief intro](http://blog.emilecantin.com/web/sysadmin/iot/javascript/sailing/2016/03/19/arduino-signalk-part-2.html).

You can specify the settings file via command line with `bin/signalk-server -s <path-to-your-settings-file>`.

You can also configure the path to the settings file with environment variable `SIGNALK_NODE_SETTINGS`.

The http port can be configured separately with environment variable `PORT`. You can also [run on port 80 with systemd](https://github.com/tkurki/marinepi-provisioning/blob/d3d624629799a3b96234a90fc42bc22dae4fd3a2/roles/node-app/templates/node_app_systemd_socket.j2). Environment variable NMEA0183PORT sets the NMEA 0183 tcp port.

Storing Configuration Outside The Server Install Directory
==========================================================
You can store configuration like the settings file, plugin cofiguration and defaults.js in a directory outside of the server install using the `-c` option (or the `SIGNALK_NODE_CONFIG_DIR` env variable).

By default, the server will look for a `settings.json` and a `defaults.json` file in the given directory.

For example, `./bin/signalk-server -c /usr/local/etc/node_server_config`

In this case, the server would look for the settings file at `/usr/local/etc/node_server_config/settings.json`

You can overwrite the default settings file name by specifying the -s argument.

For example, ./bin/signalk-server -c /usr/local/etc/node_server_config -s test_settings.json`

In this case, the server would look for the settings file at `/usr/local/etc/node_server_config/test_settings.json`

Environment variables
---------------------
- `SIGNALK_NODE_SETTINGS` override the path to the settings file.
- `SIGNALK_NODE_CONFIG_DIR` override the path to find server configuration files.
- `PORT` override the port for http/ws service (default is 3000).
- `SSLPORT` override the port for https/wss service. If defined activates ssl as forced, default protocol (default is 3443).
- `PROTOCOL` override http/https where the server is accessed via https but the server sees http (for example when Heroku handles https termination)
- `EXTERNALPORT` the port used in /signalk response and Bonjour advertisement. Has precedence over configuration file.
- `EXTERNALHOST` the host used in /signalk response and Bonjour advertisement. Has precedence over configuration file.
- `FILEUPLOADSIZELIMIT` override the file upload size limit (default is '10mb').
- `NMEA0183PORT`  override the port for the NMEA 0183 over tcp service (default is 10110).
- `TCPSTREAMPORT` override the port for the Signal K Streaming (deltas) over TCP.
- `TCPSTREAMADDRESS` override the address the Signal K Stream (deltas) over TCP is listening on.
- `DISABLEPLUGINS` disable all plugins so that they can not be enabled (default is false).
- `DEFAULTENABLEDPLUGINS` a comma separated list of plugin ids that are overridden to be enabled by default if no setttings exist. lower preference than `DISABLEPLUGINS`.
- `PLUGINS_WITH_UPDATE_DISABLED` a comma separated list of plugin that will not be updated.
- `SECURITYSTRATEGY` override the security strategy module name.
- `WSCOMPRESSION` compress websocket messages (default is false).
- `MAXSENDBUFFERSIZE` the maximum number of bytes allowed in the server's send buffer of a WebSocket connection. The connection will be terminated if this is exceeded. Guards against slow or dysfunctional clients that can not cope with the message volume (default is 512 * 1024 bytes).
- `SIGNALK_SERVER_IS_UPDATABLE` allows the server to be updated through the GUI even if it is not installed in the standard paths (default is false). if set to true, the server must have been installed with `npm install -g signalk-server`.
- `SIGNALK_DISABLE_SERVER_UPDATES` disables server updates in the GUI (default is false).
- `DEBUG` a comma-separated list of tags for debugging the specified module (For example: signalk-server*,signalk-provider-tcp). Can now be defined directly in the graphical interface.
 More help on how to use the debug here: https://www.npmjs.com/package/debug#wildcards
- `IS_IN_DOCKER` used to tell the server it is in Docker and not normally updateable (default is false).
- `NPMREGISTRYTIMEOUT` how long to wait for the registry when retrieving the App Store listing (default is 20s).
- `SECRETKEY` a secret string used to generate an authentication token (the internal default autogenerated is a string of 512 hex chars like 'ef8307a4c7a4bd7...309d947bca3')
- `ALLOW_DEVICE_ACCESS_REQUESTS` used when a device needs to gain access to a secured Signal K server (default is true) (https://signalk.org/specification/1.4.0/doc/access_requests.html).
- `ALLOW_NEW_USER_REGISTRATION` (default is true).
- `ADMINUSER` force a account for admin user (username:password format).
- `PRESERIALCOMMAND` command to run before opening a serial port.

Real Inputs
---------------
To hook the server up to your real inputs you need to create a configuration file that connects to your input source and applies the relevant parsers / converters in the provider pipeline.

Inputs are configured as an array of pipedProviders, each with an id and an array of pipeElements. You need to create a pipedProviders entry for each of your inputs. The pipedProvider must include 'id' (name of the interface, e.g. NMEA0183 from AIS could be called "AIS"). The first pipeElement is the source of the data ("providers/serialport" for a serial interface such as USB, "providers/filestream" if the data comes from a file, "providers/tcp" if the source is a TCP port etc.). You will see in the example settings that the second pipeElement is often "providers/liner". This is a pipeElement that splits the input into separate lines and passes one line at a time to the next pipeElement. The final pipeElement or group of pipeElements is where the translation or passing to the server occurs. For NMEA0183, this is "providers/nmea0183-signalk", for N2K (NMEA2000) it is "providers/n2kAnalyzer" and then "providers/n2k-signalk".

There are also special pipeElements such as "providers/log" (see below), and "providers/throttle" which changes the playback from files to the bytes per second rate set in the options. The "providers/execute" pipeElement lets you pass a command to the server, as set in the options.

Each PipeElement is configured with `options`. Different PipeElements use different configuration parameters, like for serialport you can configure baud rate and for udp connection the port.

A PipeElement may require some options entry that is available already in the configuration file (`nmea0183-signalk` needs the self id). This can be accomplished with [optionMappings property](https://github.com/SignalK/signalk-server-node/blob/5134ce5f48f25b2b270176f39d3e8e530dedb825/settings/volare-udp-settings.json#L34-L43).

You can also use optionMappings property to optionally override `options` entries with command line parameters. For example you can specify the data file for file playback from the command line as `bin/signalk-server -s settings/volare-file-settings.json --nmeafilename=samples/nais400-merrimac.log` with [this configuration](https://github.com/SignalK/signalk-server-node/blob/5134ce5f48f25b2b270176f39d3e8e530dedb825/settings/volare-file-settings.json#L28-L33).

Look through the examples in the settings folder and copy pipedProviders that suit your setup. You can combine as many as you want. See [multiple sources]( https://github.com/SignalK/signalk-server-node/blob/master/settings/multiple-sources.json) example

Make sure that the settings file you are using is valid JSON. This can be done in an online validator like [JSONLint](https://jsonlint.com/)

### NMEA0183

There is an example settings file for using NMEA 0183 input from a serial device that you can use to start up the server: `bin/signalk-server -s settings/volare-serial-settings.json`. You can change the `port` and `baudrate` in the [settings file](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-serial-settings.json#L23-L27).


### NMEA 2000 (via NGT-1 & Canboat)

There is an example settings file for N2K from N2K/CANBus. Make sure to change the command option to match the NGT-1 port like in this [example](https://github.com/SignalK/signalk-server-node/blob/master/settings/actisense-serial-settings.json#L12)

### Signal K

A provider that handles Signal K deltas can be set up with the following elements:
- a source pipeElement (`providers/filestream`, `providers/serialport`, `providers/tcp`, `providers/udp`)
- `providers/liner`
- `providers/from_json`

Furthermore you can use data from a Signal K server with the `providers/mdns-ws` source. Without any configuration it will use the Signal K discovery process to discover any Signal K servers in the local network, such as iKommunicate, and connect to it. No other pipeElements are needed. See the [example configuration file](https://github.com/SignalK/signalk-server-node/blob/master/settings/signalk-ws-settings.json). You can also configure `mdns-ws` with `host` and `port`, which will disable the discovery process and make it connect directly to the specified server.

### File

An input from a file uses the `providers/filestream`. The options to change are `filename` and `fromAppProperty` ,see [NMEA0183](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-file-settings.json#L23-L34) and [N2K](https://github.com/SignalK/signalk-server-node/blob/master/settings/multiple-sources.json#L81-L82) examples.

### Serial

An input from a serial port uses the `providers/serialport` pipeElement. It takes the options `device` and `baudrate` and optionally "toStdout"(see [example](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-serial-settings.json#L25-L26)). `serialport` has an internal line splitter, so a **pipedProvider with serialport as the source does not need `liner` and will not work with one**.

### TCP

`providers/tcp` is a TCP client that can connect to a server and receive input from a TCP socket. It takes the options `host` and `port` (see [example](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-tcp-settings.json#L29-L30)).

### UDP

settings/volare-udp-settings provides an example of NMEA0183 input over UDP port 7777. If you have trouble getting this to work try setting up DEBUG environment variable with `export DEBUG=signalk-server:udp-provider` and sending manually input with netcat `echo  '$IIDBT,034.25,f,010.44,M,005.64,F*27' | nc -4u -w1 localhost 7777`. This should result in the server logging the NMEA sentence it receives. UDP source takes `port` option.

### GPSD

Please see [example settings files](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-gpsd-settings.json).


Bonjour support
---------------

Bonjour support will be enabled by default if your system supports it and has the required software installed. See also https://github.com/agnat/node_mdns#installation for more information.

When Bonjour is enabled the server advertises itself via Bonjour. This means that Bonjour-aware software running in the same network can discover the Signal K server and access it. For example the server shows up in Safari at Bookmarks => Bonjour => Webpages.

You can disable Bonjour/mDNS by adding the entry `"mdns": false` to the config file. See `settings/volare-gpsd-settings.json` for example.

The server can also automatically discover other Signal K devices and connect to them. See `settings/signalk-ws-settings.json` for an example. If the incoming data should be treated as data about `self` the identity in the settings file and in the incoming data need to match or the incoming data should not include context, as the default is `self`.

HTTPS
-----
Https is not enabled by default. To enable it, set `"ssl":true` in the [settings file](https://github.com/SignalK/signalk-server-node/blob/master/settings/aava-non-ssl-file-settings.json#L9). If no `ssl-key.pem` & `ssl-cert.pem` files are found under settings they will be created. If you need to configure a certificate chain add it in `ssl-chain.pem` under settings.

By default the server listens to both http and https in the same port.

Logging
-------

You can log all the input data in pre-Signal K format by adding the `log` element to your pipeElement pipeline. It creates hourly files with the data from all the configured providers, interleaved/multiplexed with one message per line. The multiplexed log files can be played back with `multiplexedlog` pipeElement element. Please beware the standard discriminators in [multiplexedlog](https://github.com/SignalK/signalk-server-node/blob/master/providers/multiplexedlog.js). For extensive use of logging, please see [Cassiopeia](https://github.com/tkurki/cassiopeia-settings/blob/master/signalk-server-settings.json)

Server Plugins
-------

Plugin configuration interface is at [/plugins/configure](http://localhost:3000/plugins/configure/). See [Server Plugins](SERVERPLUGINS.md) for more information.

# Charts

Signal K chart support is provided by the [@signalk/charts-plugin](https://www.npmjs.com/package/@signalk/charts-plugin) plugin.

After installing and configuring the plugin from the admin console, use a client app such as [Freeboard SK](https://www.npmjs.com/package/@signalk/freeboard-sk) or [Tuktuk Plotter](https://www.npmjs.com/package/tuktuk-chart-plotter) to retrieve a list of charts and present them.

# Custom logo

You can change the admin application's top left logo by placing a SVG file named `logo.svg` in the settings directory (default: $HOME/.signalk/).

# Source Priority

You can specify relative precedence between sources for a single Signal K path.

The idea is that for a specific path you list sources in decreasing precedence with source specific timeouts.

Incoming data from a source is dropped (not handled at all) by the server if the previous value for the path is *from a source with higher precedence* and it is *not older than the timeout*.

The _source priority_ algorithm  compares the *latest value* that was passed through against a new value:
- is the latest value from a source that has a lower or equal priority than the incoming value's source? if true pass the value
- else: is the latest value older than the timeout for incoming source's timeout? if yes pass the value
- else: ignore the value

Note that the filtering takes place on *path level, not on delta level*: if a delta contains multiple path-value pairs some may be filtered out and others handled.

There is no timeout for the highest priority source, it is handled always.

Timeout for data from unlisted sources is 10 seconds.

[FAQ](https://github.com/SignalK/signalk-server-node/wiki/FAQ:-Frequently-Asked-Questions)
-------------


Further Reading
---------------
* http://signalk.org/index.html
* http://signalk.org/dev/messageFormat.html
* NMEA0183 support: [nmea0183-signalk](https://github.com/SignalK/signalk-parser-nmea0183)
* NMEA 2000 support: [n2k-signalk](https://github.com/SignalK/n2k-signalk) via [canboat](https://github.com/canboat/canboat)


License
-------
Copyright [2015] [Fabian Tollenaar, Teppo Kurki and Signal K committers]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
