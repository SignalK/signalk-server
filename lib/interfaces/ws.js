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

  app.connections = {};
  
  debug('Starting Primus/WS interface');

  primus.on('connection', function(spark) {
    debug(spark.id + " connected with params " + JSON.stringify(spark.query));

    var onChange;
    var event;
    if (spark.query.stream === 'delta') {
      event = 'change:delta';
      onChange = function(data) {
        spark.write(data);
      };
    } else if (spark.query.stream === 'subscribe') {
      debug('stream:subscribe');
      spark.paths = [];
      event = 'change:delta';
      onChange = function (delta) {
        var doSend = delta.updates.some(function (update) {
          return update.values.some(function (value) {
            return spark.paths.some(function (path) {
              return path === value.path;
            });
          });
        });
        if (doSend) {
          spark.write(delta);
        }
      };
      spark.on('data', function (msg) {
        debug("<" + JSON.stringify(msg));
        if (msg.command === 'subscribe') {
          spark.paths = spark.paths.concat(msg.paths);
        }
      });
    } else {
      event = 'change';
      onChange = function(data) {
        spark.write(app.signalk.retrieve());
      };
      spark.write(app.signalk.retrieve());//output tree after connect
    }

    app.signalk.on(event, function(data) {
      onChange(data);
    });
    spark.onDisconnect = function() {
      app.signalk.removeListener(event, onChange);
    }

    app.connections[spark.id] = spark;
  });

  primus.on('disconnection', function(spark) {
    spark.onDisconnect();
    debug(spark.id + " disconnected");
  });

}).call(global);