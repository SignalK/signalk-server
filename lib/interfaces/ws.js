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

var supportedQuerySubscribeValues = ['self', 'all'];

module.exports = function(app) {
  'use strict';

  var _ = require('lodash'),
    debug = require('debug')('signalk-server:interfaces:ws'),
    Primus = require('primus'),
    api = {},
    started = false,
    primus;

  api.mdns = {
    name: app.config.settings.ssl ? "_signalk-wss" : "_signalk-ws",
    type: "tcp",
    port: app.config.port
  };

  var selfContext = 'vessels.' + app.selfId;

  api.start = function() {
    debug('Starting Primus/WS interface');

    started = true;

    primus = new Primus(app.server, {
      transformer: 'websockets',
      pathname: '/signalk/v1/stream',
      timeout: false
    });

    primus.before('querysubscribes', function(req, res, next) {
      if (!req.query.subscribe || supportedQuerySubscribeValues.indexOf(req.query.subscribe) >= 0) {
        next();
      } else {
        res.statusCode = 501;
        res.statusMessage = 'Implemented query parameter values are ' + supportedQuerySubscribeValues;
        res.end('Implemented query parameter values are ' + supportedQuerySubscribeValues);
      }
    });

    primus.on('connection', function(spark) {
      debug(spark.id + " connected with params " + JSON.stringify(spark.query));

      spark.on('data', function(msg) {
        debug("<" + JSON.stringify(msg));
      });

      var onChange = function(data) {
        spark.write(data);
      }

      if (!spark.query.subscribe || spark.query.subscribe === 'self') {
        onChange = function(msg) {
          if (!msg.context || msg.context === selfContext) {
            spark.write(msg)
          }
        }
      }

      app.signalk.on('delta', onChange);

      spark.onDisconnect = function() {
        app.signalk.removeListener('delta', onChange);
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
