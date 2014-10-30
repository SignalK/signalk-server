(function() {
  
  'use strict';

  var O         = require('observed')
    , fs        = require('fs')
    , debug     = require('debug')('signalk-server/config/settings')
    , config    = this.app.config
    , settings  = app.config.settings || {}
  ;

  try {
    settings._data = require(config.appPath + '.signalkrc');
  } catch(err) {
    settings._data = {
      providers: {},
      user: {}
    };
  }
  
  settings.set = function(category, key, value) {
    if(category === 'user') {
      settings._data['user'][key] = value;
    } else {
      if(typeof settings._data.providers[category] !== 'object' || settings._data.providers[category] === null) {
        settings._data.providers[category] = {};
      }

      settings._data.providers[category][key] = value;
    }

    return settings;
  };

  settings.get = function(category, key) {
    if(category === 'user') {
      return settings._data.user[key];
    } 

    return settings._data.providers[category][key];
  }

  settings.all(category) {
    if(category === 'user') {
      return settings._data.user;
    } else {
      return settings._data.providers[category];
    }
  };

  settings.unset = function(category, key) {
    if(category === 'user') {
      delete settings._data['user'][key];
    } else {
      delete settings._data.providers[category][key];
    }

    return settings;
  };

  O(settings._data).on('change', function() {
    fs.writeFile(config.appPath + '.signalkrc', JSON.stringify(settings._data, null, 2), { encoding: 'utf-8' }, function(err) {
      if(err) {
        debug(err.message);
        debug(err.stack);
      }
    });
  });

  setTimeout(function() {
    settings.set('user', 'name', 'Tollenaar');
  }, 2000);

}).call(global);