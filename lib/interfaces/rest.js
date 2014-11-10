(function() {
  'use strict';

  var app     = this.app
    , debug   = require('debug')('signalk-server:interfaces:rest')
  ;

  app.get('/api/v1/*', function(req, res) {
    var path = String(req.path).replace('/api/v1/', '');
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

}).call(global);