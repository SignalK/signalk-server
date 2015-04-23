SignalK Server in Node
================

An implementation of a [Signal K](http://signalk.org) server for vessels. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO). 

The Server acts as a multiplexer/aggregator of the SignalK streams input by one or more Providers. The merged SignalK data   is available in streaming format over a WebSocket connection and via a REST interface.


Get up and running
------------------
Prerequisites
* node and npm installed

See [these instructions](https://github.com/joyent/node/wiki/Installing-Node.js-via-package-manager#debian-and-ubuntu-based-linux-distributions) for Node installation on Raspberry Pi.

Get the repo with either `git clone https://github.com/SignalK/signalk-server-node.git`
or as a simple zip file from https://github.com/SignalK/signalk-server-node/archive/master.zip and extract it.

Go to the directory where you put the downloaded code and install dependencies with 
````
npm install
```

Start the server with 
```
bin/nmea-from-file
```

This will start the server with a sample configuration file and the server will start playing back set of [NMEA 0183](http://en.wikipedia.org/wiki/NMEA_0183) data from file. The data is available immediately via the REST interface at http://localhost:3000/api/v1/.

A simple way to connect to the WebSocket interface from the command line is to install wscat and use that:
```
npm install -g wscat
wscat --connect 'ws://localhost:3000/signalk/stream?stream=delta'
````

If you want to use [NMEA2000](http://en.wikipedia.org/wiki/NMEA_2000) data you need at least [Canboat analyzer](https://github.com/canboat/canboat/wiki/analyzer) to parse NMEA 2000 data to json and [Canboat actisense-serial](https://github.com/canboat/canboat/wiki/actisense-serial) for getting live data from Actisense [NGT-1](http://www.actisense.com/products/nmea-2000/ngt-1/ngt-1). 

If you have analyzer available on your PATH you can start the server with a sample NMEA2000 data file with `bin/n2k-from-file`. 

For getting live data from your NGT-1 you need to figure out what device path your device is mounted on, edit the configuration file to match you path and start server with `bin/n2k-from-actisense`.

If you have your own n2k data file you can use that with `bin/n2k-from-file --n2kfilename your-file-name`.

The server advertises itself via Bonjour. This means that Bonjour-aware software running in the same network can discover the Signal K server and access it. For example the server shows up in Safari at Bookmarks => Bonjour => Webpages.

You can disable Bonjour/mDNS by adding the entry `"mdns": false` to the config file. See `settings/volare-gpsd-settings.json` for example.

Further Reading
---------------
* http://signalk.org/index.html
* http://signalk.org/dev/messageFormat.html


License
-------
Copyright [2015] [Fabian Tollenaar, Teppo Kurki and SignalK committers]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
