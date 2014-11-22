(function() {
  'use strict';

  var app     = this.app
    , _       = require('lodash')
    , debug   = require('debug')('signalk-server:interfaces:ws')
    , Primus  = require('primus')
    , primus  = new Primus(app.server, { 
      transformer: 'websockets',
      pathname: '/signalk/stream' })
  ;

  
  debug('Starting Primus/WS interface');

  primus.on('connection', function(spark) {
    debug(spark.id + " connected with params " + JSON.stringify(spark.query));

    var onChange;
    var event;
    if (spark.query.stream === 'delta') {
      event = 'change:delta';
      onChange = function(data) {
        spark.write(data);
      }
    } else {
      event = 'change';
      onChange = function(data) {
        spark.write(app.signalk.retrieve());
      };
      spark.write(app.signalk.retrieve());//output tree after connect
    }

    app.signalk.on(event, onChange);

    spark.onDisconnect = function() {
      app.signalk.removeListener(event, onChange);
    }

  });

  primus.on('disconnection', function(spark) {
    spark.onDisconnect();
    debug(spark.id + " disconnected");
  });

}).call(global);