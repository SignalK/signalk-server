var _ 			= require('lodash')
,	colors 		= require('colors')
,	uuid 		= require('node-uuid')
,	fork 		= require('child_process').fork
,	path 		= require('path')
;

function Provider(provider, streamFn, debug) {
	// Provider information
	this.debug 		= !!debug;
	this.name 		= '';
	this.id 		= '';
	this.identity 	= null;
	this.fork 		= null;
	this._to 		= null;
	this.sleep 		= 1000;
	this.streamFn 	= streamFn;

	this.init(provider);
}

Provider.prototype.init = function(provider) {
	this.name = provider.toLowerCase().replace('provider-', '');
	this.id   = uuid.v4().toUpperCase();
	this.start();
};

Provider.prototype.start = function() {
	this.log('Starting new fork');
	
	var self = this;
	
	// CREATE FORK
	this.fork = fork(path.join(__dirname, '../../providers/', this.name));
	
	// SETUP DIFFERENT LISTENERS
	this.fork.on('message', function() { self.handleMessage.apply(self, arguments); });
	this.fork.on('error', function() { self.handleError.apply(self, arguments); });
	this.fork.on('close', function() { self.handleClose.apply(self, arguments); });
	this.fork.on('disconnect', function() { self.handleDisconnect.apply(self, arguments); });
	this.fork.on('exit', function() { self.handleExit.apply(self, arguments); });
};

Provider.prototype.handleMessage = function(data) {
	if(data !== null && typeof data === 'object' && typeof data.messageType === 'string' && data.payload !== null && typeof data.payload === 'object') {
		if(this.debug) this.log('Received', data.messageType);

		if(data.messageType.toLowerCase() === 'identity') {
			this.identity = data.payload;
			if(this.debug) this.log('Set identity:\n', this.identity);
		}

		if(data.messageType.toLowerCase() === 'data') {
			this.streamFn(data.payload);
		}
	} else {
		if(this.debug) this.log('Reveived invalid data', data);
	}
};

Provider.prototype.handleError = function() {
	if(this.debug) this.log('Provider send an error', arguments);
	var self = this;
	clearTimeout(this._to);
	this._to = setTimeout(function() { self.start(); }, this.sleep);
};

Provider.prototype.handleClose = function() {
	if(this.debug) this.log('Provider send close', arguments);
	var self = this;
	clearTimeout(this._to);
	this._to = setTimeout(function() { self.start(); }, this.sleep);
};

Provider.prototype.handleDisconnect = function() {
	if(this.debug) this.log('Provider send disconnect', arguments);
	var self = this;
	clearTimeout(this._to);
	this._to = setTimeout(function() { self.start(); }, this.sleep);
};

Provider.prototype.handleExit = function() {
	if(this.debug) this.log('Provider send exit', arguments);
	var self = this;
	clearTimeout(this._to);
	this._to = setTimeout(function() { self.start(); }, this.sleep);
};

Provider.prototype.log = function() {
	var date = new Date();
	var z = function(n) { if(parseInt(n) > 9) { return "" + n; } else { return "0" + n; } };
	var args = [ ('[' + date.getFullYear() + '-' + z(date.getMonth() + 1) + '-' + z(date.getDate()) + ' ' + z(date.getHours()) + ':' + z(date.getMinutes()) + ':' + z(date.getSeconds()) + ']').white + ('[provider-' + this.name + ']').yellow ];
	
	for(var i in arguments) {
		args.push(arguments[i]);
	}

	console.log.apply(console, args);
};

module.exports = Provider;