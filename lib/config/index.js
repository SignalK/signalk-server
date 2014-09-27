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

 (function() {

  "use strict";

  var colors        = require('colors');
  var fs            = require("fs");
  var express       = require("express");
  var EventEmitter  = require("events").EventEmitter;

  var app           = this.app;
  var config        = this.app.config = {};
  var env           = this.app.env = process.env;

  app.event = new EventEmitter();

  app.log = function log() {
    var date = new Date();
    var z = function(n) { if(parseInt(n) > 9) { return "" + n; } else { return "0" + n; } };
    var args = [ ('[' + date.getFullYear() + '-' + z(date.getMonth() + 1) + '-' + z(date.getDate()) + ' ' + z(date.getHours()) + ':' + z(date.getMinutes()) + ':' + z(date.getSeconds()) + '.' + date.getMilliseconds() + ']').white + '[saildata-server]'.yellow ];

    for(var i in arguments) {
      args.push(arguments[i]);
    }

    console.log.apply(console, args);
  };

  try {
    var pkg = require('../../package.json');


    config.settings = require('../../' + getSettingsFilename(app.argv));
    config.name   = pkg.name;
    config.author   = pkg.author;
    config.version  = pkg.version;
  } catch(err) {
    app.log('error parsing JSON', err);
    config.settings = {};
    config.name     = "";
    config.author   = "";
    config.vesion   = -1;
  }

  config.port = env.PORT || 3000;
  app.use(express.logger());

  require('./development');
  require('./production');

}).call(global);

function getSettingsFilename(argv) {
  return argv.s || 'settings.json';
}

