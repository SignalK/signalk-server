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

 
var _     = require('lodash')
, path    = require('path')
;

function Provider(app, provider, callback) {
  // Provider information
  this.app       = app;
  this.debug     = !!(this.app.config.debug);
  this.name      = '';
  this.file      = '';
  this.identity  = null;
  this.streamFn  = callback;

  this.init(provider);
}

Provider.prototype.init = function(providerSettings) {
  this.settings = providerSettings;
  this.name     = this.settings.name;
  this.file     = this.settings.provider;
  this.start();
};

Provider.prototype.start = function() {
  this.log('Starting Provider', '('+this.file.grey+')' + ':', this.name.cyan);

  var self = this;
  
  try {
    this.provider = require(path.normalize(__dirname + '/../../providers/' + this.file));
    this.provider.init(this, function(data) { self.handleMessage.call(self, data) }, this.debug);
  } catch(err) {
    this.log("Error initializing provider:", err.message, "\n", err.stack);
  }
};

Provider.prototype.handleMessage = function(data) {
  if(data !== null && typeof data === 'object') {
    if(this.debug) this.log('Received data from provider "' + this.name + '"');

    if(typeof data.messageType === 'string' && data.messageType.toLowerCase() === 'identity') {
      this.identity = data.payload;
      if(this.debug) this.log('Set identity:\n', this.identity);
    } else {
      this.streamFn(data);
    }
  } else {
    if(this.debug) this.log('Reveived invalid data', data);
  }
};

Provider.prototype.log = function() {
  var date = new Date();
  var z = function(n) { if(parseInt(n) > 9) { return "" + n; } else { return "0" + n; } };
  var args = [ ('[' + date.getFullYear() + '-' + z(date.getMonth() + 1) + '-' + z(date.getDate()) + ' ' + z(date.getHours()) + ':' + z(date.getMinutes()) + ':' + z(date.getSeconds()) + '.' + date.getMilliseconds() + ']').white + ('[provider-' + this.name + ']').yellow ];
  
  for(var i in arguments) {
    args.push(arguments[i]);
  }

  console.log.apply(console, args);
};

module.exports = Provider;