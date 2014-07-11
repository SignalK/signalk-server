(function() {
	
	"use strict";

	var colors 			= require('colors');
	var fs 				= require("fs");
	var express 		= require("express");
	var EventEmitter 	= require("events").EventEmitter;
	
	var app 			= this.app;
	var config 			= this.app.config = {};
	var env 			= this.app.env = process.env;

	app.event = new EventEmitter();
	
	app.log = function log() {
		var date = new Date();
		var z = function(n) { if(parseInt(n) > 9) { return "" + n; } else { return "0" + n; } };
		var args = [ ('[' + date.getFullYear() + '-' + z(date.getMonth() + 1) + '-' + z(date.getDate()) + ' ' + z(date.getHours()) + ':' + z(date.getMinutes()) + ':' + z(date.getSeconds()) + '.' + date.getMilliseconds() + ']').white + '[saildata-server]'.yellow ];
		
		for(var i in arguments) {
			args.push(arguments[i]);
		}

		console.log.apply(console, args);
	};

	try {
		//var pkg 		= fs.readFileSync('package.json', { encoding: 'utf8' });
		//	pkg 		= JSON.parse(pkg);

		//config.settings = fs.readFileSync('settings.json', { encoding: 'utf8' });
		//config.settings = JSON.parse(config.settings);

		var pkg = require('../../package.json');

		config.settings = require('../../settings.json');
		config.name 	= pkg.name;
		config.author 	= pkg.author;
		config.version 	= pkg.version;
	} catch(err) {
		app.log('error parsing JSON', err);
		config.settings = {};
		config.name   	= "";
		config.author 	= "";
		config.vesion 	= -1;
	}

	app.configure(function() {
		config.port = env.PORT || 3000;
		app.use(express.logger());
	});

	require('./development');
	require('./production');

}).call(global);