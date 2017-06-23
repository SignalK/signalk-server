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
  const passport = require("passport")
  const jwt = require('jsonwebtoken')
  
  api.mdns = {
    name: app.config.settings.ssl ? "_signalk-wss" : "_signalk-ws",
    type: "tcp",
    port: app.config.port
  };

  api.start = function() {
    debug('Starting Primus/WS interface');

    started = true;

    primus = new Primus(app.server, {
      transformer: 'websockets',
      pathname: '/signalk/v1/stream',
      pingInterval: false
    });

    var authenticationOn = false;
    if ( !_.isUndefined(app.config.settings.authentication)
         && _.isBoolean(app.config.settings.authentication.ws)
         && app.config.settings.authentication.ws
       )
    {
      primus.authorize(authorize)
      authenticationOn = true;
    }
      
    primus.on('connection', function(spark) {
      debug(spark.id + " connected with params " + JSON.stringify(spark.query));

      var onChange = function(data) {
        spark.write(data);
      }

      var unsubscribes = []

      spark.on('data', function(msg) {
        debug("<" + JSON.stringify(msg));
        if (msg.updates) {
          app.handleMessage('ws', msg)
        }
        if (msg.subscribe) {
          app.subscriptionmanager.subscribe(msg, unsubscribes, spark.write.bind(this), spark.write.bind(this));
        }
        if (msg.unsubscribe && msg.context === '*' && msg.unsubscribe[0].path === '*') {
          debug("Unsubscribe all")
          unsubscribes.forEach(unsubscribe => unsubscribe());
          app.signalk.removeListener('delta', onChange)
        }
      });

      spark.on('end', function() {
        unsubscribes.forEach(unsubscribe => unsubscribe());
      })

      if (!spark.query.subscribe || spark.query.subscribe === 'self') {
        onChange = function(msg) {
          if (!msg.context || msg.context === app.selfContext) {
            spark.write(msg)
          }
        }
      }

      if (spark.query.subscribe && spark.query.subscribe === 'none') {
        onChange = function() {}
      } else if ( authenticationOn ) {
        var thatOnChange = onChange;
        var lastCheck = new Date()
        onChange = function(msg) {
          var now = new Date()
          if ( now - lastCheck > 60*1000 )
          {
            debug("checking")
            lastCheck = now
            authorize(spark, function(error) {
              if ( error )
              {
                spark.end(undefined, { reconnect: true });
                return;
              }
            });
          }
          thatOnChange(msg);
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

  function authorize(req, authorized)
  {
    var token = req.query.token
    , error
    , payload;

    if ( ! token )
    {
      var header = req.headers.authorization
      if ( header && header.startsWith('JWT ') ) {
        token = header.substring('JWT '.length)
      }
    }

    if (!token) {
      error = new Error('Missing access token');
      debug(error.message);
      return authorized(error);
    }

    //
    // `jwt-simple` throws errors if something goes wrong when decoding the JWT.
    //
    try {
      payload = jwt.decode(token, app.config.settings.authentication.jwtSecretKey);
    }
    catch (e) {
      debug(e.message);
      return authorized(e);
    }

    if ( !payload ) {
      error = new Error('Invalid access token');
      debug(error.message);
      return authorized(error);
    }

    //
    // At this point we have decoded and verified the token. Check if it is
    // expired.
    //
    if (Date.now()/1000 > payload.exp) {
      error = new Error('Expired access token');
      debug(error.message);
      return authorized(error);
    }

    //
    // Check if the user is still present and allowed in our db. You could tweak
    // this to invalidate a token.
    //
    var user = app.config.settings.authentication.users.find(user => user.username == payload.id )
    if ( !user ) {
      error = new Error('Invalid access token');
      debug(error.message);
      return authorized(error);
    }

    authorized();
  }

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

