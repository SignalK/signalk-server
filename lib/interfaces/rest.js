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
  var pathPrefix = '/signalk';
  var apiPathPrefix = pathPrefix + '/v1/api';

  return {
    start: function() {
      app.get(apiPathPrefix + '*', function(req, res) {
        var path = String(req.path).replace(apiPathPrefix, '');
        var data = app.signalk.retrieve();
        var self = data.self;
        var last = data;

        if(path === 'self' || path === 'vessels/self' || path === 'vessels/self/') {
          return res.json(data.vessels[self]);
        }

        path = path.split('/');

        for(var i in path) {
          var p = path[i];

          if(p === 'self') {
            p = self;
          }

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
              'signalk-http': 'http://' + process.env.HOST+ (app.config.port === 80 ? '' : ':' + app.config.port) + '/signalk/v1/api', 
              'signalk-ws': 'http://' + process.env.HOST+ (app.config.port === 80 ? '' : ':' + app.config.port) + '/signalk/v1/stream'
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