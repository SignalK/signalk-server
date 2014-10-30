(function() {
  'use strict';

  var app     = this.app
    , _       = require('lodash')
    , debug   = require('debug')('signalk/interfaces/ws')
    , Primus  = require('primus')
    , primus  = new Primus(app.server, { transformer: 'websockets' })
  ;

  app.connections = {};
  
  debug('Starting Primus/WS interface');

  primus.on('connection', function(spark) {
    app.connections[spark.id] = spark;
    spark.write(app.signalk.retrieve());
  });

  primus.on('disconnection', function(spark) {
    delete app.connections[spark.id];
  });

  app.signalk.on('change', function() {
    if(_.size(app.connections) > 0) {
      primus.write(app.signalk.retrieve());
    }
  });
}).call(global);