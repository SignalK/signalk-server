/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

module.exports = function(app) {
  'use strict';

  var debug = require('debug')('signalk-server:interfaces:rest');
  var express = require('express');

  var pathPrefix = '/signalk';
  var apiPathPrefix = pathPrefix + '/v1/api/';

  return {
    start: function() {
      app.use('/', express.static(__dirname + '/../../public'));


      app.get(apiPathPrefix + '*', function(req, res) {
        var path = String(req.path).replace(apiPathPrefix, '');
        var data = app.signalk.retrieve();
        var last = data;

        path = path.length > 0 ? path.replace(/\/$/, '').replace(/self/, app.selfId).split('/') : [];

        for(var i in path) {
          var p = path[i];

          if(typeof last[p] !== 'undefined') {
            last = last[p];
          }
        }

        return res.json(last);
      });

      //TODO make exposed port configurable, as we have a reverse proxy in front of us and what we report may be different
      //from the port node is listening on
      app.get(pathPrefix, function(req, res) {
        res.json({
          'endpoints': {
            'v1': {
              'version': '1.alpha1',
              'signalk-http': 'http://' + getHostname(app.config)+ (app.config.port === 80 ? '' : ':' + app.config.port) + '/signalk/v1/api',
              'signalk-ws': 'http://' + getHostname(app.config)+ (app.config.port === 80 ? '' : ':' + app.config.port) + '/signalk/v1/stream'
            }
          }
        });
      })

    },

    mdns: {
      name: "_signalk-http",
      type: "tcp",
      port: app.config.port
    }
  };
};

function getHostname(config) {
  if (config.hostname) {
    return config.hostname;
  }
  try {
    return require('os').hostname();
  } catch(ex) {
    return "hostname_not_available";
  }
}
