![Signal K logo](https://user-images.githubusercontent.com/5200296/226164888-d33b2349-e608-4bed-965f-ebe4339b4376.png)

[![npm version](https://badge.fury.io/js/signalk-server.svg)](https://badge.fury.io/js/signalk-server)
[![npm license](https://img.shields.io/npm/l/signalk-server.svg)](https://www.npmjs.com/package/signalk-server)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

[![Open Collective backers and sponsors](https://img.shields.io/opencollective/all/signalk)](https://opencollective.com/signalk)

## Contents
* [Introduction](#introduction)
* [Signal K Platform](#signal-k-platform)
* [Community & support](#community--support)
* [How to get Signal K Server](#how-to-get-signal-k-server)
* [Other necessary hardware](#other-necessary-hardware)
* [Installing from NPM](#installing-from-npm)
* [Configuration and use](#configuration-and-use)
* [Supported PGNs, Sentences and more](#supported-pgns-sentences-and-more)
* [Environment variables](#environment-variables)
* [Settings files](#settings-files)
* [Debugging](#debugging)
* [Development](#development)
* [Sponsoring Signal K](#sponsoring-signal-k)
* [License](#license)

## Introduction
Signal K Server is a server application that runs on a central hub in a boat. If you use or develop marine electronics, Signal K Server has something to offer for you.

### Boaters and Boat Owners
For boaters, Signal K Server runs in the background and makes functionality and data available to other apps and devices.
One of its most used features is to be a wireless AIS and navigation server for popular apps like Navionics, iSailor, iNavX, Aqua Map and WilhelmSK on your phones and tablets.

Signal K Server can also take care of the anchor watch, be a weather station or an automatic logbook for you.
A different example, it can turn your boat into a MarineTraffic station which may give free access to [the MarineTraffic professional plans](https://help.marinetraffic.com/hc/en-us/articles/360017183497-As-a-station-owner-am-I-entitled-to-a-free-Subscription-).
These are all just examples: there is far more to Signal K Server.

If you are a boat owner, you can easily run Signal K Server on a Victron Cerbo GX, RaspberryPi or similar hardware. To take full advantage, you will probably want to connect it to your boat network via NMEA 0183 or NMEA 2000 but it is not a requirement.

### Marine Vendors
For Marine vendors who build marine hardware and software, for example those developing navigation, monitoring and tracking systems, Signal K Server is an opportunity to accelerate development and decrease time to market, by taking advantage of a proven, modern and extensible software platform that is open source and available with a permissive Apache 2.0 license. Signal K Server is implemented in Node.js and is easy to integrate into modern systems that run Linux derivatives.

Signal K Server is already running inside products developed by Victron Energy, Airmar Technology and others.

### Software Developers & Boat Electronics Hobbyists
There are many boaters who happen to be highly skilled software developers and engineers, who want to build software for themselves and share with others. If you are one of them, Signal K offers you a free, modern and open platform developed by boaters for other boaters like you. Signal K Server features an extensible [plugin framework](https://github.com/SignalK/signalk-server/blob/master/SERVERPLUGINS.md), [web applications](https://github.com/SignalK/signalk-server/blob/master/WEBAPPS.md) as well as a rich set of [REST](https://signalk.org/specification/1.7.0/doc/rest_api.html) and [Streaming APIs](https://signalk.org/specification/1.7.0/doc/streaming_api.html).

Signal K Server takes care of all the complicated parts of protocol decode, and conversions to and from NMEA2000, NMEA0183 and many more protocols. It can also act as data hub for additional sensors, see the [Signal K SensESP project](https://github.com/SignalK/SensESP) for [ESP32](https://en.wikipedia.org/wiki/ESP32).

Signal K Server makes the data available in JSON format according to the [Signal K standard specification](https://signalk.org/specification/latest/). This allows developers to bypass all the hurdles typically encountered when wanting to implement something for a boat. [Getting started with a plugin](https://github.com/SignalK/signalk-server/blob/master/SERVERPLUGINS.md#getting-started-with-plugin-development) is surprisingly easy.

## Signal K Platform

Signal K is more than just the Signal K Server, it is a comprehensive platform that encompasses three major components:

1. **The Signal K Data Standard**: an open marine data standard. It is a modern data format for marine use, suitable for WiFi, cellphones, tablets and the internet. It is built on standard web technologies including JSON, WebSockets and HTTP. More information on [https://signalk.org](https://signalk.org/index.html).
2. **Signal K Server**: Software in this GitHub repository and described in this document. Signal K server is a full stack application developed in Node.js. Its back-end multiplexes data from and to NMEA0183, NMEA 2000, Signal K and other marine protocols, as well as WiFi, LAN and Internet, and provides APIs and websockets for access and control. Its front-end provides an extensible web-based application allowing easy configuration and management of server functions and capabilities.
3. **Signal K Plugins and Webapps**: Built using the extensibility of Signal K Server with a plugin framework, allows developers to develop applications that easily integrate with Signal K server, extend its capabilities and publish them through npm. All published plugins become available in all existing Signal K server installations, which provides an easy distribution mechanism.

## Community & support

See [Github Discussions](https://github.com/SignalK/signalk/discussions/) and [Slack (chat)](https://signalk-dev.slack.com/).
New to Signal K Slack? Then [click here for an invite](https://join.slack.com/t/signalk-dev/shared_invite/zt-1leccop43-KrU7G6yBq9g91KXjZtNg1g).

There is a [Signal K Server FAQ](https://github.com/SignalK/signalk-server/wiki/FAQ:-Frequently-Asked-Questions) on the Wiki.

## How to get Signal K Server?

For the typical boater, not being a software developer nor electrical engineer, the best option is to get a (commercially available) product that already has Signal K Server inside. These are the currently available devices:

* [SmartBoat module](https://www.airmar.com/productdescription.html?id=231&trk=organization_guest_main-feed-card_feed-article-content) by Airmar
* [Cerbo GX](https://www.victronenergy.com/panel-systems-remote-monitoring/cerbo-gx) and other GX Devices by Victron Energy  ([see Venus OS Large manual](https://www.victronenergy.com/live/venus-os:large))

For a more technical DIY oriented boater, a RaspberryPi based setup offers a very cost-attractive alternative.
These prebuilt images for RaspberryPis take away most of the complexity involved from the software side:

* [BBN Marine OS](https://github.com/bareboat-necessities/lysmarine_gen#what-is-lysmarine-bbn-edition)
* [OpenPlotter](https://openmarine.net/openplotter) by OpenMarine
* [Venus OS for RaspberryPis](https://github.com/victronenergy/venus/wiki/raspberrypi-install-venus-image) by Victron Energy

Also available, Docker images for Linux:

* [Signal K docker images](https://github.com/SignalK/signalk-server/tree/master/docker)

And an installer for Windows:

* [https://github.com/SignalK/signalk-server-windows](https://github.com/SignalK/signalk-server-windows)

Next level up is to use provisioning scripts:

* [MarinePi Provisioning](https://github.com/tkurki/marinepi-provisioning) - Ansible scripts to setup RaspberryPi for boat use

Another level up, this document explains how to install Signal K Server, as well as its dependencies, on a RaspberryPi that is already running Raspberry Pi OS:

* [Installation on a RaspberryPi](https://github.com/SignalK/signalk-server-node/blob/master/raspberry_pi_installation.md)

Ofcourse it is also possible to install (just) the Signal K Server application from either NPM or Github. Which is covered a two chapters further down below.

## Other necessary hardware

Especially when running Signal K Server on a RaspberryPi, extra hardware, such as USB converters or HATs will be required.
[This entry in the FAQ](https://github.com/SignalK/signalk-server/wiki/FAQ:-Frequently-Asked-Questions#how-do-i-integrate-with-nmea2000-can-bus) lists how to connect to NMEA2000 / CAN-Bus.

## Installing from NPM

Prerequisites:
* Node.js version 16 with latest npm installed (signalk-server works for the time being on Node version >=10, but we are moving to the latest LTS version that is v16 in 9/2021)

    $ sudo npm install -g signalk-server

Now you can start the server with sample data:
* NMEA0183 sample data: `signalk-server --sample-nmea0183-data`
* NMEA2000 sample data: `signalk-server --sample-n2k-data`

To generate your own vessel settings file and configure the server to start automatically, run:

    $ sudo signalk-server-setup

## Configuration and use

### Opening the Signal K Server Admin UI

For all described options of running Signal K Server, ie. on an Airmar Smartboat, a Victron Cerbo GX or a RaspberryPi, the way to configure it is via the Admin UI.
Open the Admin UI by navigating to http://[ipaddress]:3000/. Here is what it will look like when opened up on a Victron Cerbo GX:

![image](https://user-images.githubusercontent.com/5200296/226478726-568d8ea3-5f46-4e7b-b964-4fdefb386c32.png)

The top of the screen shows some actual stats. Below that is a pane showing all configured Connections & Plugins. These are the plugins shown in above screenshot:

- `sk-to-nmea0183` is the plugin that makes navigation data available on WiFi and/or LAN (TCP); typically used by apps on phones and tablets.
- `signalk-n2kais-nmea0183` is another plugin, does the same, but then for AIS data
- `venus` is a plugin that connects to the data bus inside the Victron GX device
- `n2k-on-ve.can-socket` is not a plugin but a data connection. This one defines the Signal K Server connection to the NMEA2000 CAN-bus port.

### Creating an admin account

The first thing to do is create an admin account. This is done in the Settings -> Users page:

![image](https://user-images.githubusercontent.com/5200296/226754646-3bc60ddb-245a-4bd2-ab2f-b5539bdefa77.png)

Besides recommended from a security point of view, setting an admin account also enables the Restart button.

After creating the account, the server needs to be restarted.
How to do that depends on how you are using Signal K Server: self installed from NPM, embedded on a commercial device or otherwise.
Power cycling the device that Signal K Server is running on will always work.

### Setting up data connections

This screenshot shows how to setup an NMEA0183 connection:

![image](https://user-images.githubusercontent.com/5200296/226479444-853570cb-83ea-4246-afbe-06cafd48d790.png)

### Installing Plugins and Webapps

The Appstore menu is where to add, update and remove Plugins and Webapps:

![image](https://user-images.githubusercontent.com/5200296/226479620-303a2e6e-a4f7-4ecb-b1f1-a668fb147d23.png)

The entries with the blue icons are Webapps. The entries with the green icons are Plugins. An internet connection is required for Signal K Server to fetch information about availble Plugins and webapps.

Typically, plugins make for functionality such as protocol conversion. And Webapps provide a user interface, up to a fully featured Chartplotter that runs in a web browser:

![image](https://user-images.githubusercontent.com/5200296/226479871-6f3769af-4fa4-43d6-871f-4a54bec372fa.png)

To install Plugins and Webapps, click the "Available" menu on the left. It will show a categorised list of all available Plugins:

![image](https://user-images.githubusercontent.com/5200296/226480596-f65f5429-57d5-4d31-bb13-615d5664e2c4.png)

It is also possible to search for and browse Plugins and Webapps in the NPM registry:

  * [Plugins](https://www.npmjs.com/search?q=keywords%3Asignalk-node-server-plugin)
  * [Webapps](https://www.npmjs.com/search?q=keywords:signalk-webapp)

### Restarting Signal K Server

After adding a Plugin, the server needs to be restarted, see Restart button at the top right.

If the restart button is not showing, then usually thats because there is no user account created yet.

### Configuring Plugins

After the restart, the new Plugin needs to be enabled and configured. See the Server -> Plugin Config menu:

![image](https://user-images.githubusercontent.com/5200296/226481818-18c5cbe1-9118-4555-ab8b-1622c3e9404b.png)

### Vessel Base Data and Server Settings

![image](https://user-images.githubusercontent.com/5200296/226482046-dfb759dc-abbb-4987-a810-a24b77d0927e.png)

![image](https://user-images.githubusercontent.com/5200296/226482099-b9dd46ff-72a6-44e4-b384-1d15a4621e63.png)

## Supported PGNs, sentences and more

* NMEA2000 PGNs: Reading NMEA2000 data is done by [n2k-signalk](https://github.com/SignalK/n2k-signalk) via [canboatjs](https://github.com/canboat/canboatjs). [Canboat PGN database](https://canboat.github.io/canboat/canboat.html)
* NMEA0183 sentences: [nmea0183-signalk](https://github.com/SignalK/signalk-parser-nmea0183)
* TODO ADD OTHER SUPPORTED PROTOCOLS

## Environment variables

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
- `SIGNALK_NODE_SETTINGS` override the path to the settings file.
- `SIGNALK_NODE_CONFIG_DIR` override the path to find server configuration files.

## Settings files 

### Introduction to settings files

Note that it is not necessary to modify any settings files. All configuration can be done via the Admin UI.

To get familiar, take a look at the different settings files in the `settings` directory and read the [brief intro](http://blog.emilecantin.com/web/sysadmin/iot/javascript/sailing/2016/03/19/arduino-signalk-part-2.html).

You can specify the settings file via command line with `bin/signalk-server -s <path-to-your-settings-file>`.

You can also configure the path to the settings file with environment variable `SIGNALK_NODE_SETTINGS`.

The http port can be configured separately with environment variable `PORT`. You can also [run on port 80 with systemd](https://github.com/tkurki/marinepi-provisioning/blob/d3d624629799a3b96234a90fc42bc22dae4fd3a2/roles/node-app/templates/node_app_systemd_socket.j2). Environment variable NMEA0183PORT sets the NMEA 0183 tcp port.

### Storing configuration outside install directory

You can store configuration like the settings file, plugin cofiguration and defaults.js in a directory outside of the server install using the `-c` option (or the `SIGNALK_NODE_CONFIG_DIR` env variable).

By default, the server will look for a `settings.json` and a `defaults.json` file in the given directory.

For example, `./bin/signalk-server -c /usr/local/etc/node_server_config`

In this case, the server would look for the settings file at `/usr/local/etc/node_server_config/settings.json`

You can overwrite the default settings file name by specifying the -s argument.

For example, ./bin/signalk-server -c /usr/local/etc/node_server_config -s test_settings.json`

In this case, the server would look for the settings file at `/usr/local/etc/node_server_config/test_settings.json`

This is, for example, used on platforms where signalk-server is installed on a read only partition.

### Configuring inputs

Inputs are configured in a file that connects to your input source and applies the relevant parsers / converters in the provider pipeline.

Inputs are configured as an array of pipedProviders, each with an id and an array of pipeElements. You need to create a pipedProviders entry for each of your inputs. The pipedProvider must include 'id' (name of the interface, e.g. NMEA0183 from AIS could be called "AIS"). The first pipeElement is the source of the data ("providers/serialport" for a serial interface such as USB, "providers/filestream" if the data comes from a file, "providers/tcp" if the source is a TCP port etc.). You will see in the example settings that the second pipeElement is often "providers/liner". This is a pipeElement that splits the input into separate lines and passes one line at a time to the next pipeElement. The final pipeElement or group of pipeElements is where the translation or passing to the server occurs. For NMEA0183, this is "providers/nmea0183-signalk", for N2K (NMEA2000) it is "providers/n2kAnalyzer" and then "providers/n2k-signalk".

There are also special pipeElements such as "providers/log" (see below), and "providers/throttle" which changes the playback from files to the bytes per second rate set in the options. The "providers/execute" pipeElement lets you pass a command to the server, as set in the options.

Each PipeElement is configured with `options`. Different PipeElements use different configuration parameters, like for serialport you can configure baud rate and for udp connection the port.

A PipeElement may require some options entry that is available already in the configuration file (`nmea0183-signalk` needs the self id). This can be accomplished with [optionMappings property](https://github.com/SignalK/signalk-server-node/blob/5134ce5f48f25b2b270176f39d3e8e530dedb825/settings/volare-udp-settings.json#L34-L43).

You can also use optionMappings property to optionally override `options` entries with command line parameters. For example you can specify the data file for file playback from the command line as `bin/signalk-server -s settings/volare-file-settings.json --nmeafilename=samples/nais400-merrimac.log` with [this configuration](https://github.com/SignalK/signalk-server-node/blob/5134ce5f48f25b2b270176f39d3e8e530dedb825/settings/volare-file-settings.json#L28-L33).

Look through the examples in the settings folder and copy pipedProviders that suit your setup. You can combine as many as you want. See [multiple sources]( https://github.com/SignalK/signalk-server-node/blob/master/settings/multiple-sources.json) example

Make sure that the settings file you are using is valid JSON. This can be done in an online validator like [JSONLint](https://jsonlint.com/)

#### NMEA0183

There is an example settings file for using NMEA 0183 input from a serial device that you can use to start up the server: `bin/signalk-server -s settings/volare-serial-settings.json`. You can change the `port` and `baudrate` in the [settings file](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-serial-settings.json#L23-L27).


#### NMEA 2000 (via NGT-1 & Canboat)

There is an example settings file for N2K from N2K/CANBus. Make sure to change the command option to match the NGT-1 port like in this [example](https://github.com/SignalK/signalk-server-node/blob/master/settings/actisense-serial-settings.json#L12)

#### Signal K

A provider that handles Signal K deltas can be set up with the following elements:
- a source pipeElement (`providers/filestream`, `providers/serialport`, `providers/tcp`, `providers/udp`)
- `providers/liner`
- `providers/from_json`

Furthermore you can use data from a Signal K server with the `providers/mdns-ws` source. Without any configuration it will use the Signal K discovery process to discover any Signal K servers in the local network, such as iKommunicate, and connect to it. No other pipeElements are needed. See the [example configuration file](https://github.com/SignalK/signalk-server-node/blob/master/settings/signalk-ws-settings.json). You can also configure `mdns-ws` with `host` and `port`, which will disable the discovery process and make it connect directly to the specified server.

#### File

An input from a file uses the `providers/filestream`. The options to change are `filename` and `fromAppProperty` ,see [NMEA0183](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-file-settings.json#L23-L34) and [N2K](https://github.com/SignalK/signalk-server-node/blob/master/settings/multiple-sources.json#L81-L82) examples.

#### Serial

An input from a serial port uses the `providers/serialport` pipeElement. It takes the options `device` and `baudrate` and optionally "toStdout"(see [example](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-serial-settings.json#L25-L26)). `serialport` has an internal line splitter, so a **pipedProvider with serialport as the source does not need `liner` and will not work with one**.

#### TCP

`providers/tcp` is a TCP client that can connect to a server and receive input from a TCP socket. It takes the options `host` and `port` (see [example](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-tcp-settings.json#L29-L30)).

#### UDP

settings/volare-udp-settings provides an example of NMEA0183 input over UDP port 7777. If you have trouble getting this to work try setting up DEBUG environment variable with `export DEBUG=signalk-server:udp-provider` and sending manually input with netcat `echo  '$IIDBT,034.25,f,010.44,M,005.64,F*27' | nc -4u -w1 localhost 7777`. This should result in the server logging the NMEA sentence it receives. UDP source takes `port` option.

#### GPSD

Please see [example settings files](https://github.com/SignalK/signalk-server-node/blob/master/settings/volare-gpsd-settings.json).

### Other options

#### mDNS / Bonjour support

Bonjour support will be enabled by default if your system supports it and has the required software installed. See also https://github.com/agnat/node_mdns#installation for more information.

When Bonjour is enabled the server advertises itself via Bonjour. This means that Bonjour-aware software running in the same network can discover the Signal K server and access it. For example the server shows up in Safari at Bookmarks => Bonjour => Webpages.

You can disable Bonjour/mDNS by adding the entry `"mdns": false` to the config file. See `settings/volare-gpsd-settings.json` for example.

The server can also automatically discover other Signal K devices and connect to them. See `settings/signalk-ws-settings.json` for an example. If the incoming data should be treated as data about `self` the identity in the settings file and in the incoming data need to match or the incoming data should not include context, as the default is `self`.

#### HTTPS

Https is not enabled by default. To enable it, set `"ssl":true` in the [settings file](https://github.com/SignalK/signalk-server-node/blob/master/settings/aava-non-ssl-file-settings.json#L9). If no `ssl-key.pem` & `ssl-cert.pem` files are found under settings they will be created. If you need to configure a certificate chain add it in `ssl-chain.pem` under settings.

By default the server listens to both http and https in the same port.

#### Logging

You can log all the input data in pre-Signal K format by adding the `log` element to your pipeElement pipeline. It creates hourly files with the data from all the configured providers, interleaved/multiplexed with one message per line. The multiplexed log files can be played back with `multiplexedlog` pipeElement element. Please beware the standard discriminators in [multiplexedlog](https://github.com/SignalK/signalk-server-node/blob/master/providers/multiplexedlog.js). For extensive use of logging, please see [Cassiopeia](https://github.com/tkurki/cassiopeia-settings/blob/master/signalk-server-settings.json)

#### Server Plugins

Plugin configuration interface is at [/plugins/configure](http://localhost:3000/plugins/configure/). See [Server Plugins](SERVERPLUGINS.md) for more information.

#### Charts

Signal K chart support is provided by the [@signalk/charts-plugin](https://www.npmjs.com/package/@signalk/charts-plugin) plugin.

After installing and configuring the plugin from the admin console, use a client app such as [Freeboard SK](https://www.npmjs.com/package/@signalk/freeboard-sk) or [Tuktuk Plotter](https://www.npmjs.com/package/tuktuk-chart-plotter) to retrieve a list of charts and present them.

#### Custom logo

You can change the admin application's top left logo by placing a SVG file named `logo.svg` in the settings directory (default: $HOME/.signalk/).

#### Source Priority

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

## Debugging

If the Admin UI is available, go to Server -> Server Log and enter the the names of the compononets you want to debug.

Otherwise, you can edit the file `~/.signalk/debug' and add them there. For example: `@signalk/aisreporter,signalk-server:udp-provider`

## Development

### Further reading

The documents provide more details about developing Webapps or Plugings for Signal K Server, as well as working on the server itself:

* [CONTRIBUTING.md](CONTRIBUTING.md)
* [SERVERPLUGINS.md](SERVERPLUGINS.md)
* [WEBAPPS.md](WEBAPPS.md)
* [WORKING_WITH_COURSE_API.md](WORKING_WITH_COURSE_API.md)
* [WORKING_WITH_RESOURCES_API.md](WORKING_WITH_RESOURCES_API.md)
* [RESOURCE_PROVIDER_PLUGINS.md](RESOURCE_PROVIDER_PLUGINS.md)
* [SECURITY.md](SECURITY.md)

Documentation for the maintainers:
* [releasing.md](releasing.md)

### Install from git

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

This small demo shows how to connect the Signal K Server WebSocket interface from the command line:
```
npm install -g wscat2
wscat 'ws://localhost:3000/signalk/v1/stream?subscribe=all'
```

## Sponsoring Signal K

See Signal K on [Open Collective](https://opencollective.com/signalk).

## License
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
