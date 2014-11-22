(function () {

  var express       = require('express')
    , namespace     = require('express-namespace')
    , Multiplexer   = require('signalk-multiplexer')
    , _             = require('lodash')
    , debug         = require('debug')('signalk-server:index')
    , app           = this.app = express()
    , server        = require('http').createServer(app)
  ;

  // config & options
  require('./config/config');

  module.exports = this.app;

  app.server      = server;
  app.signalk     = new Multiplexer(app.config.settings.vessel.mmsi || app.config.settings.vessel.uuid);
  app.interfaces  = [];

  debug("Interfaces:" + JSON.stringify(app.config.settings.interfaces));
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
  server.listen(app.config.port);
}).call(global);