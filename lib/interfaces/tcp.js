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

 var _ = require('lodash');

module.exports = function(app) {
  'use strict';
  var net = require('net');
  var openSockets = {};
  var idSequence = 0;
  var server = null;
  var port = 5555;
  var api = {};


  var debug = require('debug')('signalk-server:interfaces:tcp');
  api.start = function() {
    debug('Starting tcp interface');

    server = net.createServer(function(socket) {
      socket.id = idSequence++;
      socket.on('error', function(err){
        debug('Error:' + err + " " + socket.id + " " + socket.name);
        delete openSockets[socket.id];
      })
      socket.on('close', function(hadError){
        debug('Close:' + hadError + " " + socket.id + " " + socket.name);
        delete openSockets[socket.id];
      })
      socket.name = socket.remoteAddress + ":" + socket.remotePort;
      debug('Connected:' + socket.id + " " + socket.name);
      openSockets[socket.id] = socket;
      socket.write(getHello() + '\r\n')
      socket.on('end', function() { // client disconnects
        debug('Ended:' + socket.id + " " + socket.name);
        delete openSockets[socket.id];
      });
    });
    app.signalk.on('delta', function(data) {
      var jsonData = JSON.stringify(data);
      _.values(openSockets).forEach(function(socket) {
        try {
          socket.write(jsonData + '\r\n');
        } catch (e) {
          console.error(e + ' ' + socket);
        }
      });
    });
    server.listen(port);
    debug("Tcp delta server listening on " + port);
  };

  api.stop = function() {
    if (server) {
      server.close();
      server = null;
    }
  };

  api.mdns = {
    name: "_signalk-tcp",
    type: "tcp",
    port: 3858
  };

  function getHello() {
    return JSON.stringify({
      self: app.selfId,
      timestamp: (new Date()).toISOString(),
      version: app.version
    })
  }

  return api;
};
