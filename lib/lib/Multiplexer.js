var colors 			= require("colors");
var EventEmitter 	= require("events").EventEmitter;
var _ 				= require("lodash");
var util 			= require("util");

function Multiplexer() {
	this.lastSignalK = null;
	this.signalK = null;
}

util.inherits(Multiplexer, EventEmitter);

Multiplexer.prototype.add = function(data) {
	var self = this; 

	if(this.signalK !== null) {
		// Clone current signalK into lastSignalK
		this.lastSignalK = _.clone(this.signalK, true);	
	}

	process.nextTick(function() {
		if(self.signalK !== null) {
			self.signalK = _.merge(self.signalK, data);
		} else {
			self.signalK = _.merge({}, data);
		}

		if(!self.hasChanged()) {
			self.emit('change');
		}
	});
};

Multiplexer.prototype.retrieve = function() {
	return _.clone(this.signalK, true);
};

Multiplexer.prototype.hasChanged = function() {
	if(this.signalK === null) return false;
	if(this.lastSignalK === null) return true;

	return !(_.isEqual(this.signalK, this.lastSignalK));
};

Multiplexer.prototype.log = function() {
	var date = new Date();
	var z = function(n) { if(parseInt(n) > 9) { return "" + n; } else { return "0" + n; } };
	var args = [ ('[' + date.getFullYear() + '-' + z(date.getMonth() + 1) + '-' + z(date.getDate()) + ' ' + z(date.getHours()) + ':' + z(date.getMinutes()) + ':' + z(date.getSeconds()) + ']').white + ('[multiplexer]').yellow ];
	
	for(var i in arguments) {
		args.push(arguments[i]);
	}

	console.log.apply(console, args);
};

module.exports = Multiplexer;