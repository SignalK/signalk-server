/*
 * 
 * prototype-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>, 
 * Teppo Kurki <teppo.kurki@iki.fi> *et al*.
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * 
 */


(function() {
	'use strict';

	var self, uuid, mdns, ad, config, browser, debug, serviceType, serviceId, SignalKServer;

	debug 				= false;
	self 				= this;

	mdns 				= require('mdns');
	uuid 				= require('node-uuid').v4;
	SignalKServer		= require('./SignalKServer');

	this.app.remote 	= {};
	this.app.__mdns 	= {};
	config 				= this.app.config;

	serviceId 			= String(uuid()).slice(0, 7);
	serviceType 		= mdns.tcp('signalk');
	ad 					= mdns.createAdvertisement(serviceType, parseInt(config.port, 10), { txtRecord: { id: serviceId } });
	browser 			= mdns.createBrowser(serviceType);

	browser.on('serviceUp', function(service) {
		if((service.txtRecord !== null && typeof service.txtRecord === 'object' && typeof service.txtRecord.id === 'string') && (service.txtRecord.id !== serviceId && typeof self.app.remote[service.txtRecord.id] === 'undefined')) {
			self.app.remote[service.txtRecord.id] = new SignalKServer(service.txtRecord.id, service);
			if(debug === true) console.log(serviceId + ' [UP ' + service.txtRecord.id + ']', self.app.remote);

			self.app.emit('remote-server::up', self.app.remote[service.txtRecord.id]);
		}
	});

	browser.on('serviceDown', function(service) {
		console.log('serviceDown', service);

		/* TODO: serviceDown <service> doesn't have a txtRecord property, so we can't check the id...
		
		if((service.txtRecord !== null && typeof service.txtRecord === 'object' && typeof service.txtRecord.id === 'string') && (typeof self.app.remote[service.txtRecord.id] === 'object' && self.app.remote[service.txtRecord.id] !== null)) {
			delete self.app.remote[service.txtRecord.id];
			if(debug === true) console.log(serviceId + ' [DOWN ' + service.txtRecord.id + ']', self.app.remote);

			self.app.emit('remote-server::down', service.txtRecord.id);
		}
		*/
	});

	this.app.__mdns.advertisement 	= ad;
	this.app.__mdns.browser 		= browser;

	ad.start();
	browser.start();

}).call(global);