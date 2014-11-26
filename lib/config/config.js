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

(function() {

  "use strict";

  var path          = require('path');
  var express       = require("express");
  var EventEmitter  = require("events").EventEmitter;
  var debug         = require('debug')('signalk-server:config:config');

  var app           = this.app;
  var config        = this.app.config = {};
  var env           = this.app.env = process.env;

  app.event         = new EventEmitter();

  try {
    var pkg = require('../../package.json');

    config.name     = pkg.name;
    config.author   = pkg.author;
    config.version  = pkg.version;
  } catch(err) {
    debug('error parsing package.json', err);
    
    config.settings = {};
    config.name     = "";
    config.author   = "";
    config.vesion   = -1;
  }

  config.appPath    = path.normalize(__dirname + '/../../');
  config.port       = env.PORT || 3000;

  if(this.overrides.port && typeof this.overrides.port === 'number') {
    debug('Port number was set using .start(), overriding all other options');
    config.port = this.overrides.port;
  }
  
  app.use(express.logger());
  
  require('./development');
  require('./production');
  require('./cli');

}).call(global);