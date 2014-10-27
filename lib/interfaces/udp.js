(function() {
  'use strict';

  var app     = this.app
    , _       = require('lodash')
    , debug   = require('debug')('signalk/interface-udp')
    , dgram   = require('dgram')
  ;

  app.signalk.on('change', function(data) {
    var data    = new Buffer(JSON.stringify(data));
    var client  = dgram.createSocket('udp4');

    client.send(data, 0, data.length, (app.config.port * 10), '127.0.0.1', function(err, bytes) {
      if(err) return debug(err);
      debug('UDP message was sent to 127.0.0.1:' + (app.config.port * 10));
      client.close();
    });
  });
}).call(global);