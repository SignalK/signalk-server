server-prototype
================

An implementation of a [Signal K](http://signalk.github.io) central server for vessels. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO). The Server acts as a multiplexer/aggregator of the SignalK streams input by one or more Providers. The merged SignalK object is than streamed over a WebSocket stream (using Socket.io 1.0).


Get up and running
------------------
- Clone the repo.
- Edit `settings.json`, or create a new settings.json file for your vessel.
- Add your Providers + their config objects to the settings file, along with some vessel information. Take a look at some of the examples for more details (we'll add a reference when things settle down around config).
- Run the server with `node index.js` and any arguments (see below).

Arguments
---------
`@TODO`

Useful links
------------
- Creating Providers (`@TODO`)
- [Creating Consumers](CONSUMERS.md)

License
-------
prototype-server: An implementation of a Signal K server for boats.
Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>, 
Teppo Kurki <teppo.kurki@iki.fi> *et al*.

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