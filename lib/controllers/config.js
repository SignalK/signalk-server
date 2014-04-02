(function() {

	"use strict";

	var path 	= require('path');

	var views 	= path.join(__dirname, './lib/views');
	var app 	= this.app;
	var config 	= this.app.config;

	module.exports = function(req, res) {
		res.json(config);
	};

}).call(global);