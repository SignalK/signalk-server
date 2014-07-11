saildata-server
===============

An implementation of a [Signal K](http://signalk.github.io) central server for boats. Intended to run on embedded devices (e.g. Raspberry Pi, Beaglebone or UDOO). The Server acts as a multiplexer/aggregator of the SignalK streams input by one or more Providers. The merged SignalK object is than streamed over a WebSocket stream (using Socket.io 1.0).


Get up and running
------------------
- Clone the repo (I will publish to NPM at some point, but this is too early a version).
- Edit `settings.json`
- Set the `ship` object to your own ship's details.
- Add one or more providers to the `providers` array. Providers reside in the `providers` directory. Take a look at the `providers/filerunner` directory for an example. *Note: whilst providers are named `provider-<provider-name>`, the containing folder does not have the `provider-` prefix. The folder is loaded a whole, so it should have an index.js file.*
- run `npm start` in the root of the folder to start the server. Alternatively, you could run the server using forever: `forever -e error.log start index.js`


Some notes
----------
*This is a very early implementation. Basic architecture is there, and it's stable.. But, it lacks a lot of features I want to implement, and I need to write more consumers. Also, I'm looking to move from Express (which is quick and easy) to something more modern. Possible candidates are Koa (I've been aching to try out generators), Sails.js (although that is very heavy for what we need) or something on top of express using Promises.*


License
-------
saildata-server: An implementation of a Signal K server for boats.
Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>

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