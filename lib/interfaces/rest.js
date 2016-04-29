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
  var versionPrefix = '/v1';
  var apiPathPrefix = pathPrefix + versionPrefix + '/api/';
  var streamPath = pathPrefix + versionPrefix + '/stream';

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
          } else {
            res.status(404).send("Not found");
            return
          }
        }

        return res.json(last);
      });

      app.get(pathPrefix, function(req, res) {
        var host = app.config.getExternalHostname();
        var port = app.config.getExternalPort();
        port = (port === '' || port === 80) ? '' : ':' + port;

        var protocol = 'http://';
        if (app.config.settings.ssl) {
          protocol = 'https://';
        }

        res.json({
          'endpoints': {
            'v1': {
              'version': '1.alpha1',
              'signalk-http': protocol + host + port + apiPathPrefix,
              'signalk-ws': protocol + host + port + streamPath
            }
          }
        });
      })

    },

    mdns: {
      name: app.config.settings.ssl ? "_signalk-https" : "_signalk-http",
      type: "tcp",
      port: app.config.port
    }
  };
};
