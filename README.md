<img width="537" alt="signalk-node" src="https://user-images.githubusercontent.com/1049678/33799103-9e461cce-dd2d-11e7-847d-da9b77bc2a84.png">

An implementation of a [Signal K](http://signalk.org) server in Node.js. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO).

The server multiplexes data from , NMEA 2000, Signal K and sensor inputs (eg. I2C connected sensors) and provides the data in Signal K format over HTTP and WebSocket. In addition it can provide NMEA0183 over tcp and udp.


Get up and running with a local install
------------------

Instructions for [installation on Raspberry Pi manually](https://github.com/SignalK/signalk-server-node/blob/master/raspberry_pi_installation.md) or [with Ansible](https://github.com/tkurki/marinepi-provisioning).

Prerequisites
* node and npm installed


Get the repo with either `git clone https://github.com/SignalK/signalk-server-node.git`
or as a simple zip file from https://github.com/SignalK/signalk-server-node/archive/master.zip and extract it.

Go to the directory where you put the downloaded code and install dependencies with
```npm install```
[Firewall giving you trouble?](https://github.com/npm/npm/wiki/Troubleshooting#npm-only-uses-git-and-sshgit-urls-for-github-repos-breaking-proxies)

Start the server with
```bin/nmea-from-file```

This will start the server with a sample configuration file and the server will start playing back set of [NMEA 0183](http://en.wikipedia.org/wiki/NMEA_0183) data from file. The data is available immediately via the REST interface at localhost:3000 both via [https](https://localhost:3000/signalk/v1/api/) and [http](http://localhost:3000/signalk/v1/api/).

A simple way to connect to the WebSocket interface from the command line is to install wscat2 and use that:
```
npm install -g wscat2
wscat 'ws://localhost:3000/signalk/v1/stream?subscribe=all'
```

If you want to use [NMEA2000](http://en.wikipedia.org/wiki/NMEA_2000) data you **must install [Canboat](https://github.com/canboat/canboat/wiki/Building)**. Canboat allows you to use data from Actisense [NGT-1](http://www.actisense.com/products/nmea-2000/ngt-1/ngt-1) and convert NMEA2000 data to a format that Signal K Node server can digest.

If you have analyzer available on your PATH you can start the server with a sample NMEA2000 data file with `bin/n2k-from-file`. An error message saying `analyzer: not found` tells that you need to [install canboat](https://github.com/canboat/canboat/wiki/Building).

For getting live data from your NGT-1 you need to figure out what device path your device is mounted on, edit the configuration file to match you path and start server with `bin/n2k-from-actisense`.

If you have your own n2k data file from canboat you can use that with `bin/n2k-from-file --n2kfilename your-file-name`.

Get up and running with Docker
--------

This does not require downloading the repository, just grab the Dockerfile and run:
```
docker build -t sk-server .
docker run --name sk-server -d -p 3000:3000 signalk-node-server
```
This will build & start a Signal K server playing back an NMEA2000 log file, accessible at http://localhost:3000/

*Note* that using Docker allows you to use NMEA2000 data without local install of canboat.

Now what?
---------

Once you have the data streams in place you probably want to use the data or at least see it in a nice format. Some sample plugins and apps are installed during the installation process. They can be accessed at http://localhost:3000. This is the landing page of your new Signal K server.
- Apps or Webapps are mainly web pages for accessing the Signal K output such as instrumentpanel, gauges or maps. See [Webapps doc](https://github.com/SignalK/signalk-server-node/blob/master/WEBAPPS.md) for more information.
- App Store shows all the Signal K Plugins and Apps that have been published via npm with the right keywords. It also shows their current status on your server and allows you to install and update these.
- Plugins are web forms to tailor your server to your needs, change parameters or get information from various sources. See [Server Plugins](SERVERPLUGINS.md)

Configuration
=============

Please take a look at the different settings files in the `settings` directory and read the [brief intro](http://blog.emilecantin.com/web/sysadmin/iot/javascript/sailing/2016/03/19/arduino-signalk-part-2.html).

You can specify the settings file via command line with `bin/signalk-server -s <path-to-your-settings-file>`.

You can also configure the path to the settings file with environment variable `SIGNALK_NODE_SETTINGS`.

The http port can be configured separately with environment variable `PORT`. You can also [run on port 80 with systemd](https://github.com/tkurki/marinepi-provisioning/blob/d3d624629799a3b96234a90fc42bc22dae4fd3a2/roles/node-app/templates/node_app_systemd_socket.j2). Environment variable NMEA0183PORT sets the NMEA 0183 tcp port.

Storing Configuration Outside The Server Install Directory
==========================================================
You can store configuration like the settings file, plugin cofiguration, defaults.js and the mapcache in a directory outside of the server install using the `-c` option (or the `SIGNALK_NODE_CONDFIG_DIR` env variable).

By default, the server will look for a `settings.json` and a `defaults.json` file in the given directory. 

For example, `./bin/signalk-server -c /usr/local/etc/node_server_config`

In this case, the server would look for the settings file at `/usr/local/etc/node_server_config/settings.json`

You can overwrite the default settings file name by specifying the -s argument.

For example, ./bin/signalk-server -c /usr/local/etc/node_server_config -s test_settings.json`

In this case, the server would look for the settings file at `/usr/local/etc/node_server_config/test_settings.json`

You should also put the charts mapcache directory at `/usr/local/etc/node_server_config/public/mapcache`.


Environment variables
---------------------
- `SIGNALK_NODE_SETTINGS` override the path to the settings file
- `SIGNALK_NODE_CONDFIG_DIR` override the path to find server configuration files
- `PORT` override the port for http/ws service
- `SSLPORT` override the port for https/wss service. If defined activates ssl as forced, default protocol.
- `EXTERNALPORT` the port used in /signalk response and Bonjour advertisement. Has precedence over configuration file.
- `EXTERNALHOST` the host used in /signalk response and Bonjour advertisement. Has precedence over configuration file.
- `NMEA0183PORT`  override the port for the NMEA 0183 over tcp service (default 10110)
- `TCPSTREAMPORT` override the port for the Signal K Streaming (deltas) over TCP
- `TCPSTREAMADDRESS` override the address the Signal K Stream (deltas) over TCP is listening on
- `DISABLEPLUGINS` disable all plugins so that they can not be enabled


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

There is an example settings file for using NMEA 0183 input from a serial device that you can use to start up the server: `bin/signalk-settings -s settings/volare-serial-settings.json`. You can change the `port` and `baudrate` in the [settings file](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-serial-settings.json#L23-L27).


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

Bonjour support is not activated by default, because it requires operating system support that is not present by default on all platforms. You can enable it by installing `mdns` with `npm install mdns` issued in the server's root folder. See also https://github.com/agnat/node_mdns#installation for more information.

Once Bonjour is enabled the server advertises itself via Bonjour. This means that Bonjour-aware software running in the same network can discover the Signal K server and access it. For example the server shows up in Safari at Bookmarks => Bonjour => Webpages.

You can disable Bonjour/mDNS by adding the entry `"mdns": false` to the config file. See `settings/volare-gpsd-settings.json` for example.

The server can also automatically discover other Signal K devices and connect to them. See `settings/signalk-ws-settings.json` for an example. If the incoming data should be treated as data about `self` the identity in the settings file and in the incoming data need to match or the incoming data should not include context, as the default is `self`.

HTTPS
-----
Https is enabled by default unless you disable it with `"ssl":true` in the [settings file](https://github.com/SignalK/signalk-server-node/blob/master/settings/aava-non-ssl-file-settings.json#L9). If no `ssl-key.pem` & `ssl-cert.pem` files are found under settings they will be created. If you need to configure a certificate chain add it in `ssl-chain.pem` under settings.

By default the server listens to both http and https in the same port.

Logging
-------

You can log all the input data in pre-Signal K format by adding the `log` element to your pipeElement pipeline. It creates hourly files with the data from all the configured providers, interleaved/multiplexed with one message per line. The multiplexed log files can be played back with `multiplexedlog` pipeElement element. Please beware the standard discriminators in [multiplexedlog](https://github.com/SignalK/signalk-server-node/blob/master/providers/multiplexedlog.js). For extensive use of logging, please see [Cassiopeia](https://github.com/tkurki/cassiopeia-settings/blob/master/signalk-server-settings.json)

Server Plugins
-------

Plugin configuration interface is at [/plugins/configure](http://localhost:3000/plugins/configure/). See [Server Plugins](SERVERPLUGINS.md) for more information.

# Charts
Signal K chart support is built on the idea that a Signal K server can provide metadata about charts, such as name, description and where the actual chart data can be accessed. Then a client app, such as [Freeboard SK](https://www.npmjs.com/package/@signalk/freeboard-sk) or [Tuktuk Plotter](https://www.npmjs.com/package/tuktuk-chart-plotter) can retrieve a list of charts and present them.

SK Node server supports charts in [TMS](https://wiki.osgeo.org/wiki/Tile_Map_Service_Specification) and [MBTiles](https://github.com/mapbox/mbtiles-spec) formats.

## TMS Charts

Get your charts and process them using the instructions at https://github.com/rob42/freeboard-installer.
Create a directory at public/mapcache and then a directory using the id of the chart, for example, public/mapcache/12272_1.
Then unzip the chart into that directory.

## MBTiles Charts

MBTiles charts are single files that you can place in public/mapcache. The server will pick them up automatically from there.

Changelog
---------

See [CHANGELOG.md](CHANGELOG.md).

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
