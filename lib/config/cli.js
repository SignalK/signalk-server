(function() {
  var app    = this.app;
  var debug  = require('debug')('signalk-server/config/cli')
  var config = this.app.config;
  // Attach all argument to a "hidden" instance variable
  this.app.__argv = process.argv.slice(2);
  // Parse __argv and attach to instance variable argv
  this.app.argv = require('minimist')(this.app.__argv);

  if(typeof this.app.argv['D'] === 'boolean' || typeof this.app.argv['debug'] === 'boolean') {
    if(this.app.argv['D'] === true) this.app.config.debug = true;
    if(this.app.argv['debug'] === true) this.app.config.debug = true;
  }

  try {
    var settings    = path.normalize(__dirname + '/../../' + getSettingsFilename(app.argv));
    config.settings = require(settings);
  } catch(e) {
    debug('error parsing settings file: ' + settings);
    config.settings = {};
  }
}).call(global);

function getSettingsFilename(argv) {
  return argv.s || 'settings.json';
}