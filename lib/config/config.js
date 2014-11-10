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
  
  app.use(express.logger());
  
  require('./development');
  require('./production');
  require('./cli');

}).call(global);