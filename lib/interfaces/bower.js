(function() {
  var express = require('express');
  this.app.use('/bower_components',  express.static(__dirname + '/../../bower_components'));
  this.app.use('/',  express.static(__dirname + '/../../bower_components'));
}).call(global);