(function() {
	
	"use strict";

	var app 	= this.app;
	var config 	= this.app.config;

	app.configure('staging', function() {
		config.environment = 'staging';
	});

}).call(global);