/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
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

var express       = require('express')
  , Multiplexer   = require('signalk-multiplexer')
  , _             = require('lodash')
  , debug         = require('debug')('signalk-server')
  , path          = require('path')
  , http          = require('http')
;

function Server(opts) {
  this.params         = opts || {};
  this.app            = express();
  this.app.started    = false;
  
  this.app.overrides  = {
    settings: this.params.settings || null,
    port: this.params.port || null
  };

  var app = this.app;

  require('./config/config')(app);

  app.signalk     = new Multiplexer(app.selfId, app.selfType);
  
}

module.exports = Server;

Server.prototype.start = function() {
  var self = this;
  var app  = this.app;

  this.server     = http.createServer(this.app);
  app.server      = this.server;
  app.interfaces  = {};
  app.connections = {};
  app.clients     = 0;

  this.server.on('connection', function(client) {
    client.id = app.clients++;
    app.connections[client.id] = client;

    debug("Client #" + client.id + " connected.");

    client.on('close', function() {
      debug("Client #" + client.id + " disconnected.");
      delete app.connections[client.id];
    });
  });

  debug("ID type: " + app.selfType);
  debug("ID: " + app.selfId);


  debug("Interfaces config:" + JSON.stringify(app.config.settings.interfaces));
  var availableInterfaces = require('./interfaces');
  
  _.forIn(availableInterfaces, function(interface, name) {
    if((!_.isObject(app.config.settings.interfaces) || _.isUndefined(app.config.settings.interfaces[name]) || app.config.settings.interfaces[name] !== false) && name !== 'mdns') {
      debug("Loading interface '" + name + "'");
      app.interfaces[name] = interface(app);

      if (app.interfaces[name] && _.isFunction(app.interfaces[name].start)) {
        debug("Starting interface '" + name + "'");
        app.interfaces[name].start();
      }
    } else if(name !== 'mdns') {
      debug("Not loading interface '" + name + "' because of configuration");
    }
  });

  if(Object.keys(app.interfaces).length > 0 && (_.isUndefined(app.config.settings.mdns) || app.config.settings.mdns !== false)) {
    availableInterfaces['mdns'](app); 
    debug("Starting interface 'mDNS'");
  } else {
    debug("Interface 'mDNS' was disabled in configuration");
  }
  
  this.app.providers = require('./pipedproviders')(this.app).start();

  this.server.listen(this.app.config.port, function() {
    console.log('signalk-server running at 0.0.0.0:' + self.app.config.port + "\n");
    self.app.started = true;
  });
};

Server.prototype.reload = function(mixed) {
  var settings, self = this; 

  if(typeof mixed === 'string') {
    try {
      settings = require(path.join(process.cwd(), mixed));
    } catch(e) {
      debug("Settings file '" + settings + "' doesn't exist.");
    }
  }

  if(mixed !== null && typeof mixed === 'object') {
    settings = mixed;
  }

  if(settings) {
    this.app.config.settings = settings;
  }

  this.stop();

  setTimeout(function() {
    self.start();
  }, 1000);

  return this;
};

Server.prototype.stop = function() {
  if(this.app.started === true) {
    _.each(this.app.interfaces, function(intf) {
      if(intf !== null && typeof intf === 'object' && typeof intf.stop === 'function') {
        intf.stop();
      }
    });

    debug("Closing server...");

    this.server.close(function() {
      debug("Server closed...");
      this.server = null;
    });

    for(var id in this.app.connections) {
      if(this.app.connections.hasOwnProperty(id)) {
        debug("Closing connection #" + id);
        this.app.connections[id].destroy();
        delete this.app.connections[id];
      }
    }

    this.app.started = false;
  }

  this.app.providers.forEach(function(providerHolder){
    providerHolder.pipeElements[0].end();
  });

  return this;
};