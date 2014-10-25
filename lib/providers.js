(function () {

  var _         = require('lodash');
  var Provider  = require('./lib/Provider');

  var app       = this.app;
  var config    = this.app.config;

  _.each(config.settings.providers, function (providerSettings) {
    var provider = new Provider(app, providerSettings, function () {
      // This function is run by Provider instance whenever new data is available
      app.multiplexer.add.apply(app.multiplexer, arguments);
    });
  });

}).call(global);