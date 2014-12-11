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
  this.server         = http.createServer(this.app);
  this.app.started    = false;
  
  this.app.overrides  = {
    settings: this.params.settings || null,
    port: this.params.port || null
  };

  var app = this.app;

  require('./config/config')(app);

  app.server     = this.server;
  app.signalk    = new Multiplexer(app.selfId, app.selfType);
  app.interfaces = {};
}

module.exports = Server;

Server.prototype.start = function() {
  var self = this;
  var app  = this.app;

  debug("Interfaces: " + JSON.stringify(app.config.settings.interfaces));
  debug("ID type: " + app.selfType);
  debug("ID: " + app.selfId);

  if(_.isArray(app.config.settings.interfaces)) {
    _.each(app.config.settings.interfaces, function(name) {
      debug("Loading interface '" + name + "'");

      try {
        var intf = require(__dirname + '/interfaces/' + name)(app);

        if(intf !== null && typeof intf === 'object' && typeof intf.start === 'function') {
          intf.start();
        }

        app.interfaces[name] = intf;
      } catch (e) {
        debug('Interface "' + name + '" doesn\'t exist');
        debug(e);
      }
    });
  }
  
  this.app.providers = require('./pipedproviders')(this.app).start();

  this.server.listen(this.app.config.port, function() {
    console.log('signalk-server running at 0.0.0.0:' + self.app.config.port + "\n");
    self.app.started = true;
  });
};

Server.prototype.reload = function(mixed) {
  var settings; 

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

  return this;
};

Server.prototype.stop = function() {
  if(this.app.started === true) {
    _.each(this.app.interfaces, function(intf) {
      if(intf !== null && typeof intf === 'object' && typeof intf.stop === 'function') {
        intf.stop();
      }
    });

    this.server.close(function() {
      debug("Server closed...");
    });

    this.app.started = false;
  }

  this.app.providers.forEach(function(providerHolder){
    providerHolder.pipeElements[0].end();
  });

  return this;
};