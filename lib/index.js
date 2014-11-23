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

  var express       = require('express')
    , namespace     = require('express-namespace')
    , Multiplexer   = require('signalk-multiplexer')
    , _             = require('lodash')
    , debug         = require('debug')('signalk-server:index')
    , app           = this.app = express()
    , server        = require('http').createServer(app)
  ;

  // config & options
  require('./config/config');

  module.exports = this.app;

  app.server      = server;
  app.signalk     = new Multiplexer(app.config.settings.vessel.mmsi || app.config.settings.vessel.uuid);
  app.interfaces  = [];

  debug("Interfaces:" + JSON.stringify(app.config.settings.interfaces));
  if(_.isArray(app.config.settings.interfaces)) {
    _.each(app.config.settings.interfaces, function(name) {
      debug("Loading interface '" + name + "'");

      try {
        app.interfaces.push(require(__dirname + '/interfaces/' + name));
      } catch(e) {
        debug('Interface "' + name + '" doesn\'t exist');
        debug(e);
      }
    });
  }

  process.nextTick(function () {
    require('./providers');
  });
  server.listen(app.config.port);
}).call(global);