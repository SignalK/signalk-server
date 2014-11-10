(function() {
  "use strict";

  var express = require('express');
  var debug   = require('debug')('signalk-server:config:development');
  var app     = this.app;
  var config  = this.app.config;

  if(app.get('env') == 'development') {
    config.environment = 'development';

    app.use(express.errorHandler({
      dumpExceptions: true,
      showStack: true
    }));

    app.all('/', function(req, res) {
      res.json(config);
    });
  }
}).call(global);