SignalK Server in Node
================

An implementation of a [Signal K](http://signalk.org) server for vessels. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO). 

The Server acts as a multiplexer/aggregator of the SignalK streams input by one or more Providers. The merged SignalK data   is available in streaming format over a WebSocket connection and via a REST interface.


Get up and running
------------------
Prerequisites
* node and npm installed

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
npm install wscat
wscat --connect 'ws://localhost:3000ignalk/stream?stream=delta'
````

If you want to use [NMEA2000](http://en.wikipedia.org/wiki/NMEA_2000) data you need at least [Canboat analyzer](https://github.com/canboat/canboat/wiki/analyzer) to parse NMEA 2000 data to json. If you have analyzer available on your PATH you can start the server with a sample NMEA2000 data file with `bin/n2k-from-file`. If you have your own n2k data file you can use that with `bin/n2k-from-file --n2kfilename your-file-name`. 

Further Reading
---------------
* http://signalk.org/index.html
* http://signalk.org/dev/messageFormat.html


License
-------
prototype-server: An implementation of a Signal K server for boats.
Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>, 
Teppo Kurki <teppo.kurki@iki.fi> et al.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
