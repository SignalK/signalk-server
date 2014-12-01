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

(function () {
  var api  = {};
  var path = require('path');

  this.overrides = {
    settings: null,
    port: null
  };

  this.__started = false;

  api.settings = function(filename) {
    this.overrides.settings = filename;
    return api;
  }.bind(this);

  api.reload = function(mixed) {
    var settings; 

    if(typeof mixed === 'string') {
      settings = require(path.join(process.cwd(), mixed));
    }

    if(mixed !== null && typeof mixed === 'object') {
      settings = mixed;
    }

    if(settings) {
      this.app.config.settings = settings;
    }

    return api;
  }.bind(this);

  api.stop = function() {
    if(this.app.server && this.__started === true) {
      this.app.server.close();
      this.__started = false;
      delete this.app;
    }
  }.bind(this);

  api.start = function(port) {
    var express       = require('express')
      , namespace     = require('express-namespace')
      , Multiplexer   = require('signalk-multiplexer')
      , _             = require('lodash')
      , debug         = require('debug')('signalk-server:index')
      , app           = this.app = express()
      , server        = require('http').createServer(app)
      , self          = this
    ;

    // set an override for port if provided
    this.overrides.port = port || null;

    // config & options
    require('./config/config');

    app.server = server;
    app.signalk = new Multiplexer(app.selfId, app.selfType);
    app.interfaces = [];

    debug("Interfaces: " + JSON.stringify(app.config.settings.interfaces));
    debug("ID type: " + app.selfType);
    debug("ID: " + app.selfId);

    if(_.isArray(app.config.settings.interfaces)) {
      _.each(app.config.settings.interfaces, function(name) {
        debug("Loading interface '" + name + "'");

        try {
          app.interfaces.push(require(__dirname + '/interfaces/' + name));
        } catch (e) {
          debug('Interface "' + name + '" doesn\'t exist');
          debug(e);
        }
      });
    }

    app.providers = require('./pipedproviders').start();

    server.listen(app.config.port, function() {
      console.log('signalk-server running at 0.0.0.0:' + app.config.port);
      self.__started = true;
    });

    return app;
  }.bind(this);

  module.exports = api;
}).call(global);