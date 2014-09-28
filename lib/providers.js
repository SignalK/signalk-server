/*
 * 
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>, 
 * Teppo Kurki <teppo.kurki@iki.fi> *et al*.
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 */

(function () {

  var _         = require('lodash');
  var Provider  = require('./lib/Provider');

  var app       = this.app;
  var config    = this.app.config;
  var providers = this.app.providers = {};

  _.each(config.settings.providers, function (providerSettings) {
    app.log('Registering provider ('+providerSettings.provider.grey+'):', providerSettings.name.cyan);

    var provider = new Provider(app, providerSettings, function () {
      // This function is run by Provider instance whenever new data is available
      app.multiplexer.add.apply(app.multiplexer, arguments);
    });

    providers[provider.id] = provider;
  });

}).call(global);