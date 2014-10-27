(function () {

  var express       = require('express')
    , namespace     = require('express-namespace')
    , Multiplexer   = require('./lib/Multiplexer')
    , _             = require('lodash')
    , debug         = require('debug')('signalk-server/index')
    , app           = this.app = express()
    , server        = require('http').createServer(app)
  ;

  // config & options
  require('./config/cli');
  require('./config/config');

  module.exports = this.app;

  server.listen(app.config.port, function() {
    app.server      = server;
    app.signalk     = new Multiplexer;
    app.interfaces  = [];

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
  });
}).call(global);