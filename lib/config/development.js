(function() {
	
	"use strict";

	var express = require('express');
	
	var app 	= this.app;
	var config 	= this.app.config;

	app.configure('development', function() {
		
		config.environment 	= 'development';
		config.debug 		= true;

		app.use(express.errorHandler({
			dumpExceptions: true,
			showStack: true
		}));

		app.all('/', require('../controllers/config'));

	});

}).call(global);