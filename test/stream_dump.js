#!/usr/bin/env node

//export DEBUG="socket.io* node myapp" to get debug output

process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

require('https').globalAgent.options.rejectUnauthorized = false;

try {
  var io = require('socket.io-client');
} catch (err) {
  console.error(err.stack);
  console.error("Have you installed socket.io-client with npm install socket.io-client?");
  process.exit(-1);
}

var socket = io.connect('https://localhost:3000/signalk/stream');

socket.on("connect_failed", function (_) {
  console.log(_)
});
socket.on('error', function (_) {
  console.error(_);
});
socket.on('connect', function () {
  console.log('connected');
});
socket.on('disconnect', function () {
  console.log('disconnected');
});

socket.on('signalk', function (msg) {
  console.log(JSON.stringify(msg, null, 2));
  console.log('----------------------------------------------------------------------\n');
});