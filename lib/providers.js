(function () {

  var _         = require('lodash');
  var Provider  = require('./lib/Provider');

  var app       = this.app;
  var config    = this.app.config;

  _.each(config.settings.providers, function (providerSettings) {
    var provider = new Provider(app, providerSettings, function () {
      app.signalk.add.apply(app.signalk, arguments);
    });
  });

}).call(global);