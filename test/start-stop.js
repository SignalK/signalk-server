var Server = require('../lib');

console.log('1. Instantiating instance...');
var server = new Server({ settings: 'volare-file-settings.json' });

console.log('2. Starting server...');
server.start();

setTimeout(function() {
  console.log('3. Stopping server...');
  server.stop();
}, 10000);


setTimeout(function() {
  console.log('4. Starting server...');
  server.start();
}, 90000);