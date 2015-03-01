var assert = require("assert")



describe('Server', function() {
  it('starts and stops', function(done) {
    var fp = require("find-free-port")
    fp(3000, function(err, freePort) {
      var Server = require('../lib');

      console.log('1. INSTANTIATING instance...');
      var server = new Server({
        settings: './test/server-test-settings.json',
        port: freePort
      });

      console.log('2. STARTING server...');
      server.start();

      setTimeout(function() {
        console.log('3. STOPPING server...');
        server.stop();
        done();
      }, 1000);
    })
  });
})