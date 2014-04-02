(function() {
	
	var express 	= require('express')
	,	colors 		= require('colors')
	,	http		= require('http')
	, 	EJSON		= require('e-json')
	,	wsServer 	= require('ws').Server
	, 	Multiplexer = require('./lib/Multiplexer')
	,	app 		= this.app = express()
	, 	server 		= http.createServer(app)
	;

	// config
	require('./config');

	// start server
	server.listen(app.config.port, function() {

		app.wss = new wsServer({ server: server });
		
		app.wss.broadcast = function(data) {
			data = EJSON.stringify(data);
			for(var i in this.clients) {
				this.clients[i].send(data);
			}
		};

		app.wss.on('connection', function(socket) {
			app.log("New client connected".blue);
		});

		app.multiplexer = new Multiplexer();

		app.multiplexer.on('change', function() {
			app.log("Signal K has changed. Sending new data to any Consumers listening to the stream.".cyan);
			app.wss.broadcast(app.multiplexer.retrieve());
		});

		app.event.emit('server ready', { address: '127.0.0.1', port: app.config.port });
		app.event.emit('socket ready', { address: '127.0.0.1', port: app.config.port });
		app.log('Server ready and listening on 127.0.0.1:' + app.config.port);
		app.log('Socket ready and listening on 127.0.0.1:' + app.config.port);

		process.nextTick(function() {
			require('./providers');
		});
	});

	// export
	module.exports = this.app;

}).call(global);