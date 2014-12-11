var Server = require('../lib');

console.log('1. INSTANTIATING instance...');
var server = new Server({ settings: 'volare-file-settings.json' });

console.log('2. STARTING server...');
server.start();

setTimeout(function() {
  console.log('3. STOPPING server...');
  server.stop();
}, 10000);


setTimeout(function() {
  console.log('4. STARTING server...');
  server.start();
}, 30000);