(function () {

  var express       = require('express')
    , Multiplexer   = require('./lib/Multiplexer')
    , _             = require('lodash')
    , debug         = require('debug')('signalk-server/index')
    , app           = this.app = express()
    , server        = require('http').createServer(app)
  ;

  // config & options
  require('./lib/cli');
  require('./config');

  module.exports = this.app;

  server.listen(app.config.port, function() {
    app.multiplexer = new Multiplexer;

    if(_.isArray(app.config.settings.interfaces)) {
      app.interfaces = [];

      _.forEach(app.config.settings.interfaces, function(name) {
        try {
          app.interfaces.push(require('./interfaces/' + name));
        } catch(e) {
          debug('interface "' + name + '" doesn\'t exist');
        }
      });
    }

    process.nextTick(function () {
      require('./providers');
    });
  });
}).call(global);