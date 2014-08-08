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

 
(function() {
	
	var express    		= require('express')
	,   memwatch 	   	= require('memwatch')
	,   colors 		   	= require('colors')
	, 	Multiplexer  	= require('./lib/Multiplexer')
  ,   fs            = require('fs')
	,	  options 		  = { key: fs.readFileSync(__dirname + '/certificates/server.key'), cert: fs.readFileSync(__dirname + '/certificates/server.crt') }

	,	  app 		      = this.app = express()
	, 	https         = require('https').createServer(options, app)
	,	  io 			      = this.app.io = require('socket.io')(https)
	;

	// config
	require('./config');

	// export
	module.exports = this.app;

	// start server
	https.listen(app.config.port, function() {
		/* Zeroconf stuff. Unused atm
    require('./lib/bonjour');

		app.on('remote-server::up', function(SignalKServer) {
			console.log('remote-server::up', SignalKServer.id);
		});

		app.on('remote-server::down', function(id) {
			console.log('remote-server::down', id);
		});
    // */
		
		// Initiate the Multiplexer...
		app.multiplexer = new Multiplexer();

		app.io.on('connection', function(socket) {
			app.log("New client connected".blue);
			socket.emit('signalk', app.multiplexer.retrieve());
		});

		app.multiplexer.on('change', function() {
			// app.log("Sending new data over the WS Stream.".cyan, app.multiplexer.retrieve().timestamp);
			app.io.emit('signalk', app.multiplexer.retrieve());
		});

		app.event.emit('server ready', { address: '127.0.0.1', port: app.config.port });
		app.log('Server ready and listening on 127.0.0.1:' + app.config.port);

		process.nextTick(function() {
			require('./providers');
		});
	});

}).call(global);
