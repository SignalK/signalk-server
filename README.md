SignalK Node Server
================

An implementation of a [Signal K](http://signalk.org) server. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO).

The server multiplexes data from , NMEA 2000, Signal K and sensor inputs (eg. I2C connected sensors) and provides the data in Signal K format over HTTP and WebSocket. In addition it can provide NMEA0183 over tcp and udp.

Note: the server does not yet support [subscription protocol](https://github.com/SignalK/signalk-server-node/issues/35).

Get up and running
------------------

Instructions for [installation on Raspberry Pi manually](https://github.com/SignalK/signalk-server-node/blob/master/raspberry_pi_installation.md) or [with Ansible](https://github.com/tkurki/marinepi-provisioning).

Prerequisites
* node and npm installed


Get the repo with either `git clone https://github.com/SignalK/signalk-server-node.git`
or as a simple zip file from https://github.com/SignalK/signalk-server-node/archive/master.zip and extract it.

Go to the directory where you put the downloaded code and install dependencies with
````
npm install
```
[Firewall giving you trouble?](https://github.com/npm/npm/wiki/Troubleshooting#npm-only-uses-git-and-sshgit-urls-for-github-repos-breaking-proxies)

Start the server with
```
bin/nmea-from-file
```

This will start the server with a sample configuration file and the server will start playing back set of [NMEA 0183](http://en.wikipedia.org/wiki/NMEA_0183) data from file. The data is available immediately via the REST interface at http://localhost:3000/signalk/v1/api/.

A simple way to connect to the WebSocket interface from the command line is to install wscat and use that:
```
npm install -g wscat
wscat --connect 'ws://localhost:3000/signalk/v1/stream?stream=delta'
````

If you want to use [NMEA2000](http://en.wikipedia.org/wiki/NMEA_2000) data you need at least [Canboat analyzer](https://github.com/canboat/canboat/wiki/analyzer) to parse NMEA 2000 data to json and [Canboat actisense-serial](https://github.com/canboat/canboat/wiki/actisense-serial) for getting live data from Actisense [NGT-1](http://www.actisense.com/products/nmea-2000/ngt-1/ngt-1).

If you have analyzer available on your PATH you can start the server with a sample NMEA2000 data file with `bin/n2k-from-file`. An error message saying `analyzer: not found` tells that you need to [install canboat](https://github.com/canboat/canboat/wiki/Building).

For getting live data from your NGT-1 you need to figure out what device path your device is mounted on, edit the configuration file to match you path and start server with `bin/n2k-from-actisense`.

If you have your own n2k data file you can use that with `bin/n2k-from-file --n2kfilename your-file-name`. Beware that the playback rate is limited in bytes per second - if your data file is from a rich N2K environment you may want to adjust the [rate parameter](https://github.com/SignalK/signalk-server-node/blob/master/settings/aava-file-settings.json#L27) in the settings file.

Now what? Consumers!
---------------

Once you have the data streams in place you probably want to use the data or at least see it in a nice format. See [Consumers](https://github.com/SignalK/signalk-server-node/blob/master/CONSUMERS.md) for details.

Configuration
=============

Please take a look at the different settings files in the `settings` directory and read the [brief intro](http://blog.emilecantin.com/web/sysadmin/iot/javascript/sailing/2016/03/19/arduino-signalk-part-2.html).

You can specify the settings file via command line with `bin/signalk-server -s <path-to-your-settings-file>`.

You can also configure the path to the settings file with environment variable `SIGNALK_NODE_SETTINGS`.

The http port can be configured separately with environment variable `PORT`. You can also [run on port 80 with systemd](https://github.com/tkurki/marinepi-provisioning/blob/d3d624629799a3b96234a90fc42bc22dae4fd3a2/roles/node-app/templates/node_app_systemd_socket.j2). Environment variable NMEA0183PORT sets the NMEA 0183 tcp port.

Real Inputs
---------------
To hook the server up to your real inputs you need to create a configuration file that connects to your input source and applies the relevant parsers / converters in the provider pipeline.

Supported inputs & formats
- NMEA0183
- NMEA 2000 (via NGT-1 & Canboat)
- Signal K delta
- File
- Serial
- TCP
- UDP
- GPSD

Please see [example settings files](https://github.com/SignalK/signalk-server-node/tree/master/settings).


Bonjour support
---------------

Bonjour support is not activated by default, because it requires operating system support that is not present by default on all platforms. You can enable it by installing `mdns` with `npm install mdns` issued in the server's root folder. See also https://github.com/agnat/node_mdns#installation for more information.

Once Bonjour is enabled the server advertises itself via Bonjour. This means that Bonjour-aware software running in the same network can discover the Signal K server and access it. For example the server shows up in Safari at Bookmarks => Bonjour => Webpages.

You can disable Bonjour/mDNS by adding the entry `"mdns": false` to the config file. See `settings/volare-gpsd-settings.json` for example.

The server can also automatically discover other Signal K devices and connect to them. See `settings/signalk-ws-settings.json` for an example. If the incoming data should be treated as data about `self` the identity in the settings file and in the incoming data need to match or the incoming data should not include context, as the default is `self`.

HTTPS
-----
You can use a self generated certificate simply by enabling SSL with `"ssl":true` in the [settings file](./tree/master/settings/aava-ssl-file-settings.json). If no `ssl-key.pem` & `ssl-cert.pem` files are found under settings they will be created.

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
