(function() {
	
	var _ 			= require('lodash');
	var Provider 	= require('./lib/Provider');

	var app 		= this.app;
	var config 		= this.app.config;
	var providers 	= this.app.providers = {};

	var streamFn = function() {
		// console.log('streamFn -', arguments);
		app.multiplexer.add.apply(app.multiplexer, arguments);
	};
	
	_.each(config.settings.providers, function(provider_name) {
		
		// var debug 	= config.debug;
		var debug 		= false;
		var provider 	= new Provider(provider_name, streamFn, debug);

		app.log('Registering provider', provider_name);
		
		providers[provider.id] = provider;
		
	});

}).call(global);