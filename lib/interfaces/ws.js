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
var flatMap = require('flatmap');

module.exports = function(app) {
  'use strict';

  var _ = require('lodash'),
    debug = require('debug')('signalk-server:interfaces:ws'),
    Primus = require('primus'),
    api = {},
    started = false,
    primus;

  api.mdns = {
    name: "_signalk-ws",
    type: "tcp",
    port: app.config.port
  };

  api.start = function() {
    debug('Starting Primus/WS interface');

    started = true;

    primus = new Primus(app.server, {
      transformer: 'websockets',
      pathname: '/signalk/v1/stream',
      timeout: false
    });

    primus.on('connection', function(spark) {
      debug(spark.id + " connected with params " + JSON.stringify(spark.query));


      if (spark.query.stream === 'subscribe') {
        debug('stream:subscribe');
        //inefficient for many sparks, should instead keep track of which sparks subscribe to which paths
        spark.paths = {};
        event = 'change:delta';
        onChange = function(delta) {
          console.log(delta)
          normalizeDelta(delta).forEach(function(oneValueDelta) {
            var doSend = oneValueDelta.updates.some(function(update) {
              return update.values.some(function(value) {
                return spark.paths[value.path];
              });
            });
            if (doSend) {
              spark.write(oneValueDelta);
            }
          });
        };
        spark.on('data', function(msg) {
          debug("<" + JSON.stringify(msg));
          if (msg.command === 'subscribe') {
            msg.paths.forEach(function(path) {
              spark.paths[path] = true;
            });
          }
          debug(spark.paths);
        });
      }

      app.signalk.on('change:delta', function(data) {
        spark.write(data)
      });

      spark.onDisconnect = function() {
        app.signalk.removeListener('change:delta', onChange);
      }

      spark.write({
        name: app.config.name,
        version: app.config.version,
        timestamp: new Date(),
        self: app.selfId,
        roles: ["master", "main"]
      })

    });

    primus.on('disconnection', function(spark) {
      spark.onDisconnect();
      debug(spark.id + " disconnected");
    });
  };

  api.stop = function() {
    if (primus.destroy && started) {
      debug("Destroying primus...");
      primus.destroy({
        close: false,
        timeout: 500
      });
    }
  };

  return api;
};

function normalizeDelta(delta) {
  return flatMap(delta.updates, normalizeUpdate).map(function(update) {
    return {
      context: delta.context,
      updates: [update]
    }
  })
};

function normalizeUpdate(update) {
  return update.values.map(function(value) {
    return {
      source: update.source,
      values: [value]
    }
  })
}
