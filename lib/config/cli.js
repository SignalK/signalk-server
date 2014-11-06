(function() {
  var path   = require('path');
  var debug  = require('debug')('signalk-server:config:cli');
  
  this.app.__argv = process.argv.slice(2);
  this.app.argv   = require('minimist')(this.app.__argv);
  var settings    = path.normalize(__dirname + '/../../' + getSettingsFilename(this.app.argv));

  try {
    this.app.config.settings = require(settings);
  } catch(e) {
    debug('error parsing settings file: ' + settings);
    this.app.config.settings = {};
  }
}).call(global);

function getSettingsFilename(argv) {
  return argv.s || 'settings.json';
}