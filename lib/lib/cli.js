(function() {
  // Attach all argument to a "hidden" instance variable
  this.app.__argv = process.argv.slice(2);
  // Parse __argv and attach to instance variable argv
  this.app.argv = require('minimist')(this.app.__argv);

  if(typeof this.app.argv['D'] === 'boolean' || typeof this.app.argv['debug'] === 'boolean') {
    if(this.app.argv['D'] === true) this.app.config.debug = true;
    if(this.app.argv['debug'] === true) this.app.config.debug = true;
  }
}).call(global);