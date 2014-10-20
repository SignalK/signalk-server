/*
 * 
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>, 
 * Teppo Kurki <teppo.kurki@iki.fi> *et al*.
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 */


(function () {

  var express = require('express')
    , colors  = require('colors')
    , Multiplexer = require('./lib/Multiplexer')
    , fs      = require('fs')
    , options = { key: fs.readFileSync(__dirname + '/certificates/server.key'), cert: fs.readFileSync(__dirname + '/certificates/server.crt') }

    , app   = this.app = express()
    , https = require('https').createServer(options, app)
    , io    = this.app.io = require('socket.io')(https)
  ;

  // config & options
  require('./lib/cli');
  require('./config');

  // export
  module.exports = this.app;

  // start server
  https.listen(app.config.port, function () {
    // Initiate the Multiplexer...
    app.multiplexer = new Multiplexer();

    app.io.of('/signalk/stream').on('connection', function (socket) {
      app.log("Client [" + String(socket.id).grey + "] connected to", "/signalk/stream".cyan);
      socket.emit('signalk', app.multiplexer.retrieve());

      var dataListener = function (data) {
        socket.emit('signalk', app.multiplexer.retrieve());
      };

      app.multiplexer.on('change', dataListener);

      socket.on('disconnect', function() {
        app.log("Client [" + String(socket.id).grey + "] disconnected from", "/signalk/stream".cyan);
        app.multiplexer.removeListener('change', dataListener);
      });
    });

    app.io.of('/signalk/stream/delta').on('connection', function (socket) {
      app.log("Client [" + String(socket.id).grey + "] connected to", "/signalk/stream/delta".cyan);

      var dataListener = function (data) {
        socket.emit('signalk', data);
      };

      app.multiplexer.on('change', dataListener);

      socket.on('disconnect', function() {
        app.log("Client [" + String(socket.id).grey + "] disconnected from", "/signalk/stream/delta".cyan);
        app.multiplexer.removeListener('change', dataListener);
      });
    });

    app.event.emit('server ready', { 
      address: '127.0.0.1', 
      port: app.config.port 
    });
    
    app.log('Server ready and listening on ' + ('127.0.0.1:' + app.config.port).cyan);
    
    if(app.config.debug === true) app.log('App is in debug mode'.inverse.red);

    process.nextTick(function () {
      require('./providers');
    });
  });

}).call(global);