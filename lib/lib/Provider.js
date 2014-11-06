var _     = require('lodash')
, path    = require('path')
, debug   = require('debug')('signalk:Provider')
;

function Provider(app, provider, callback) {
  // Provider information
  this.app       = app;
  this.name      = '';
  this.file      = '';
  this.identity  = null;
  this.callback  = callback;

  this.init(provider);
}

Provider.prototype.init = function(settings) {
  this.settings = settings;
  this.name     = this.settings.name;
  this.file     = this.settings.provider;
  this.start();
};

Provider.prototype.start = function() {
  debug('Starting Provider (' + this.file + '): ' + this.name);
  var self = this;
  
  try {
    this.provider = require(path.normalize(__dirname + '/../../providers/' + this.file));
    this.provider.init(this, function(data) { 
      self.handleMessage.call(self, data) 
    });
  } catch(err) {
    debug("Error initializing provider:", err.message, "\n", err.stack);
  }
};

Provider.prototype.handleMessage = function(data) {
  if(data !== null && typeof data === 'object') {
    debug('Received data from provider "' + this.name + '"');

    if(typeof data.messageType === 'string' && data.messageType.toLowerCase() === 'identity') {
      this.identity = data.payload;
      debug('Set identity:\n', this.identity);
    } else {
      this.callback(data);
    }
  }
};

module.exports = Provider;