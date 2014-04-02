(function() {
	
	"use strict";

	var express = require('express');

	var app 	= this.app;
	var config 	= this.app.config;

	app.configure('production', function() {
		
		config.environment 	= 'production';
		config.debug 		= false;

		app.use(express.errorHandler());
		
		app.all('/', require('../controllers/wifi'));

	});

}).call(global);