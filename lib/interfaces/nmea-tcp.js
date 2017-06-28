/*
 * Copyright 2015 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var _ = require("lodash");

module.exports = function(app) {
  "use strict";
  var net = require("net");
  var openSockets = {};
  var idSequence = 0;
  var server = null;
  var port = process.env.NMEA0183PORT || 10110;
  var api = {};

  var debug = require("debug")("signalk-server:interfaces:tcp");
  api.start = function() {
    debug("Starting tcp interface");

    server = net.createServer(function(socket) {
      socket.id = idSequence++;
      socket.name = socket.remoteAddress + ":" + socket.remotePort;
      debug("Connected:" + socket.id + " " + socket.name);
      openSockets[socket.id] = socket;
      socket.on("end", function() {
        // client disconnects
        debug("Ended:" + socket.id + " " + socket.name);
        delete openSockets[socket.id];
      });
      socket.on("error", function(err) {
        debug("Error:" + err + " " + socket.id + " " + socket.name);
        delete openSockets[socket.id];
      });
    });
    const send = data => {
      _.values(openSockets).forEach(function(socket) {
        try {
          socket.write(data + "\n");
        } catch (e) {
          console.error(e + " " + socket);
        }
      });
    };
    app.signalk.on("nmea0183", send);
    app.on("nmea0183out", send);
    server.listen(port);
    debug("NMEA0138 tcp server listening on " + port);
  };

  api.stop = function() {
    if (server) {
      server.close();
      server = null;
    }
  };

  api.mdns = {
    name: "_nmea-0183",
    type: "tcp",
    port: port
  };

  return api;
};
