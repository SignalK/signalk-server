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

if (typeof [].includes != 'function') {
  console.log("Minimum required Node.js version is 6, please update.")
  process.exit(-1)
}

var express = require('express'),
  _ = require('lodash'),
  debug = require('debug')('signalk-server'),
  path = require('path'),
  http = require('http'),
  https = require('https'),
  httpolyglot = require('httpolyglot'),
  pem = require('pem'),
  fs = require('fs'),
  FullSignalK = require('signalk-schema').FullSignalK,
  StreamBundle = require('./streambundle'),
  SubscriptionManager = require('./subscriptionmanager'),
  Mode = require('stat-mode'),
  passport = require('passport'),
  LocalStrategy = require('passport-local').Strategy,
  flash = require('connect-flash'),
  passportJWT = require("passport-jwt"),
  jwt = require('jsonwebtoken'),
  ExtractJwt = passportJWT.ExtractJwt,
  JwtStrategy = passportJWT.Strategy

function Server(opts) {
  this.params = opts || {};
  this.app = express();
  this.app.started = false;

  this.app.overrides = {
    settings: this.params.settings || null,
    port: this.params.port || null
  };

  var app = this.app;
  require('./config/config')(app);
  app.selfContext = 'vessels.' + app.selfId;
  app.version = "0.0.1"

  app.use(require('body-parser').json())

  setupAuthentication(app)
  

  app.get('/', app.readOnlyAuthenticationMiddleware(true), (req, res) => {
    res.sendFile(__dirname + '/index.html')
  })

  app.get('/loginForm',
          function(req, res) {
            var html = fs.readFileSync(__dirname + '/login.html', {encoding: 'utf8'})
            res.send(html);
           });

  app.post('/login',
           passport.authenticate('local', { successRedirect: '/',
                                            failureRedirect: '/loginForm',
                                            failureFlash: true })
          );

  app.get('/logout', function(req, res) {
    req.logout();
    res.redirect('/');
  });

  app.use('/apps/*', app.readOnlyAuthenticationMiddleware(true))
  app.use('/apps', app.readOnlyAuthenticationMiddleware(true))

  app.get('/apps', (req, res, next) => {
    var html = fs.readFileSync(__dirname + '/appindex.html', {encoding: 'utf8'})
    var insertionIndex = html.indexOf('</div>');
    var sliceToInsertion = html.slice(0, insertionIndex);
    var sliceToEnd = html.slice(insertionIndex);

    var result = sliceToInsertion;
    result += '<ul class="list-group">';
    result += app.webapps.reduce(function(result, componentInfo) {
      result += '<li class="list-group-item">';
      result += '<b><a href="' + componentInfo.name + '">' + componentInfo.name + '</a></b> ';
      result += componentInfo.description;
      result += '</li>\n';
      return result;
    }, '');
    result += '</ul>';
    result += sliceToEnd;
    res.send(result);
  })


  app.signalk = new FullSignalK(app.selfId, app.selfType, app.config.defaults);

  app.handleMessage = function(providerId, data) {
    if(data && data.updates) {
      if(typeof data.context === 'undefined' || data.context === 'vessels.self') {
        data.context = 'vessels.' + app.selfId;
      }
      data.updates.forEach(function(update) {
        if(typeof update.source != "undefined") {
          update.source.label = providerId;
        }
        if(!update.timestamp) {
          update.timestamp = (new Date()).toISOString();
        }
      })
      app.signalk.addDelta(data);
    }
  }

  app.webapps = []

  app.streambundle = new StreamBundle(app.selfId);
  app.signalk.on('delta', app.streambundle.pushDelta.bind(app.streambundle))
  app.subscriptionmanager = new SubscriptionManager(app);
}

module.exports = Server;

Server.prototype.start = function() {
  var self = this;
  var app = this.app;

  this.app.pruneInterval = setInterval(app.signalk.pruneContexts.bind(app.signalk, 60 * 60), 60 * 1000);
  this.app.providers = [];

  return new Promise((resolve, reject) => {
    createServer(app, function(err, server) {
      if (err) {
        reject(err)
        return
      }
      app.server = server;
      app.interfaces = {};
      app.connections = {};
      app.clients = 0;

      debug("ID type: " + app.selfType);
      debug("ID: " + app.selfId);

      startInterfaces(app);
      startMdns(app);
      app.providers = require('./pipedproviders')(app).start();

      var SD_LISTEN_FDS_START = 3
      var port = process.env.LISTEN_FDS > 0 ?
        {
          fd: SD_LISTEN_FDS_START
        } :
        app.config.port;

      server.listen(port, function() {
        console.log('signalk-server running at 0.0.0.0:' + port + "\n");
        app.started = true;
        resolve(self);
      });
    })
  })
};

function createServer(app, cb) {
  if(typeof app.config.settings.ssl === "undefined" || app.config.settings.ssl) {
    getCertificateOptions(function(err, options) {
      if(err) {
        cb(err)
      } else {
        debug("Starting server to serve both http and https")
        cb(null, httpolyglot.createServer(options, app));
      }
    });
    return;
  };
  var server;
  try {
    debug("Starting server to serve only http")
    server = http.createServer(app);
  } catch(e) {
    cb(e);
    return;
  }
  cb(null, server);
}

function hasStrictPermissions(stat) {
  return new Mode(stat).toString() === '-r--------'
}

function getCertificateOptions(cb) {
  if(fs.existsSync('./settings/ssl-key.pem') && fs.existsSync('./settings/ssl-cert.pem')) {
    if(!hasStrictPermissions(fs.statSync('./settings/ssl-key.pem'))) {
      cb(new Error('./settings/ssl-key.pem must be accessible only by the user that is running the server, refusing to start'))
      return
    }
    if(!hasStrictPermissions(fs.statSync('./settings/ssl-cert.pem'))) {
      cb(new Error('./settings/ssl-cert.pem must be accessible only by the user that is running the server, refusing to start'))
      return
    }
    debug("Using certificate ssl-key.pem and ssl-cert.pem in ./settings/");
    cb(null, {
      key: fs.readFileSync('./settings/ssl-key.pem'),
      cert: fs.readFileSync('./settings/ssl-cert.pem')
    });
    return;
  } else {
    createCertificateOptions(cb);
  }
}

function createCertificateOptions(cb) {
  debug("Creating certificate files in ./settings/");
  pem.createCertificate({
    days: 360,
    selfSigned: true
  }, function(err, keys) {
    if(err) {
      console.error("Could not create SSL certificate:" + err.message)
      throw err
    } else {
      fs.writeFileSync('./settings/ssl-key.pem', keys.serviceKey);
      fs.chmodSync('./settings/ssl-key.pem', '400');
      fs.writeFileSync('./settings/ssl-cert.pem', keys.certificate);
      fs.chmodSync('./settings/ssl-cert.pem', '400');
      cb(null, {
        key: keys.serviceKey,
        cert: keys.certificate
      })
    }
  });
}

function startMdns(app) {
  if(_.isUndefined(app.config.settings.mdns) || app.config.settings.mdns) {
    debug("Starting interface 'mDNS'");
    try {
      app.interfaces['mdns'] = require('./mdns')(app);
    } catch(ex) {
      debug("Could not start mDNS:" + ex);

    }
  } else {
    debug("Interface 'mDNS' was disabled in configuration");
  }
}

function startInterfaces(app) {
  debug("Interfaces config:" + JSON.stringify(app.config.settings.interfaces));
  var availableInterfaces = require('./interfaces');
  _.forIn(availableInterfaces, function(interface, name) {
    if(_.isUndefined(app.config.settings.interfaces) ||
      _.isUndefined(app.config.settings.interfaces[name]) ||
      app.config.settings.interfaces[name]) {
      debug("Loading interface '" + name + "'");
      app.interfaces[name] = interface(app);
      if(app.interfaces[name] && _.isFunction(app.interfaces[name].start)) {
        if(_.isUndefined(app.interfaces[name].forceInactive) || !app.interfaces[name].forceInactive) {
          debug("Starting interface '" + name + "'");
          app.interfaces[name].data = app.interfaces[name].start();
        } else {
          debug("Not starting interface '" + name + "' by forceInactive")
        }
      }
    } else {
      debug("Not loading interface '" + name + "' because of configuration");
    }
  });
}

Server.prototype.reload = function(mixed) {
  var settings, self = this;

  if(typeof mixed === 'string') {
    try {
      settings = require(path.join(process.cwd(), mixed));
    } catch(e) {
      debug("Settings file '" + settings + "' doesn't exist.");
    }
  }

  if(mixed !== null && typeof mixed === 'object') {
    settings = mixed;
  }

  if(settings) {
    this.app.config.settings = settings;
  }

  this.stop();

  setTimeout(function() {
    self.start();
  }, 1000);

  return this;
};

Server.prototype.stop = function(cb) {
  if(this.app.started === true) {
    _.each(this.app.interfaces, function(intf) {
      if(intf !== null && typeof intf === 'object' && typeof intf.stop === 'function') {
        intf.stop();
      }
    });

    debug("Closing server...");

    this.app.server.close(function() {
      debug("Server closed...");
      this.server = null;
      cb();
    });

    for(var id in this.app.connections) {
      if(this.app.connections.hasOwnProperty(id)) {
        debug("Closing connection #" + id);
        this.app.connections[id].destroy();
        delete this.app.connections[id];
      }
    }

    if(this.app.pruneInterval) {
      clearInterval(this.app.pruneInterval);
    }
    this.app.started = false;
  }

  this.app.providers.forEach(function(providerHolder) {
    providerHolder.pipeElements[0].end();
  });

  return this;
};

function setupAuthentication(app)
{
  if ( !_.isUndefined(app.config.settings.authentication)
       && _.isBoolean(app.config.settings.authentication.http)
       && app.config.settings.authentication.http
     )
  {
    debug("http authentication is on")
    passport.use(new LocalStrategy(
      {
        passReqToCallback : true
      },
      function(req, username, password, done) {
        var user = app.config.settings.authentication.users.find(user => user.username == username)
        if ( user && user.password == password ) {
          done(null, { id: username, type: user['type'] })
        } else {
          return done(null, false, { message: 'Invalid Login.' });
        }
      }
    ));

    passport.serializeUser(function(user, done) {
      done(null, user.id);
    });
    
    passport.deserializeUser(function(id, done) {
      done(null, { 'id': id})
    });
    
    app.use(require('cookie-parser')());
    app.use(require('body-parser').urlencoded({ extended: true }));
    app.use(require('express-session')({secret: 'MySecretKey', resave: false, saveUninitialized: false }))
    app.use(passport.initialize())
    app.use(passport.session())
    app.use(flash())

    app.adminAuthenticationMiddleware = function(redirect) {  
      return function (req, res, next) {
        if (req.isAuthenticated()) {
          var user = app.config.settings.authentication.users.find(user => user.username == req.user.id)
          if ( user.type == 'admin' ) {
            return next()
          }
        }
        if ( redirect ) {
          res.redirect('/loginForm')
        } else {
          res.status(401)
          res.send("Permission Denied")
        }
      }
    }

    app.readOnlyAuthenticationMiddleware = function(redirect) {  
      return function (req, res, next) {
        debug("isAuthenticated: " + req.isAuthenticated())
        if (req.isAuthenticated()) {
          var user = app.config.settings.authentication.users.find(user => user.username == req.user.id)
          if ( ['admin', 'readonly', 'readwrite'].find(type => user.type == type )) {
            return next()
          }
        }
        if ( redirect ) {
          res.redirect('/loginForm')
        } else {
          res.status(401)
          res.send("Permission Denied")
        }
      }
    }
  } else {
    debug("http authentication is off")
    app.adminAuthenticationMiddleware = function(redirect) {  
      return function (req, res, next) {
        return next();
      }
    }
    app.readOnlyAuthenticationMiddleware = function(redirect) {  
      return function (req, res, next) {
        return next();
      }
    }
  }


  if ( !_.isUndefined(app.config.settings.authentication)
       && _.isBoolean(app.config.settings.authentication.rest)
       && app.config.settings.authentication.rest
     )
  {
    var jwtOptions = {}
    jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeader();
    jwtOptions.secretOrKey = app.config.settings.authentication.jwtSecretKey;
    
    var strategy = new JwtStrategy(jwtOptions, function(jwt_payload, next) {
      var user = app.config.settings.authentication.users.find(user => user.username == jwt_payload.id)
      if (user) {
        next(null, user);
      } else {
        next(null, false);
      }
    });

    passport.use(strategy)

    app.put("/signalk/v1/login", function(req, res) {
      var name = req.body.username;
      var password = req.body.password;

      var user = app.config.settings.authentication.users.find(user => user.username == name )
      if( ! user ){
        res.status(401).json({message:"no such user found"});
        return
      }
      if(user.password === password) {
        var payload = {id: user.username};
        var expiration = app.config.settings.authentication.jwtExpiration || '1h'
        debug('jwt expiration: ' + expiration)
        var token = jwt.sign(payload, jwtOptions.secretOrKey, {expiresIn: expiration} );
        res.json({token: token});
      } else {
        res.status(401).json({message:"passwords did not match"});
      }
    });
  }
}
