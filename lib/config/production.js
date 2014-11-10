(function() {
  "use strict";

  var express = require('express');
  var debug   = require('debug')('signalk-server:config:production');
  var app     = this.app;
  var config  = this.app.config;

  if(app.get('env') == 'production') {
    config.environment  = 'production';
    config.debug        = false;

    app.use(express.errorHandler());
    
    app.all('/', function(req, res) {
      res.json({ 'signalk ready': true });
    });
  }
}).call(global);