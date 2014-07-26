/*
 * 
 * saildata-server: An implementation of a Signal K server for boats.
 * Copyright (C) 2014  Fabian Tollenaar <fabian@starting-point.nl>

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

function SignalKServer(id, service) {
	this.id = id;
	this.__service = service;

	this.host 	= service.host || "";
	this.port 	= service.port;
	this.ip 	= '';

	for(var i in service.addresses) {
		if(service.addresses[i].indexOf('.') !== -1) {
			this.ip = service.addresses[i];
		}
	}

	if(this.host === "" && this.ip === "") {
		this.host 	= "localhost";
		this.ip 	= '127.0.0.1';
		this.uri 	= "localhost:" + this.port;
	} else {
		if(this.host !== "") this.uri = this.host + ":" + this.port;
		if(this.host === "") this.uri = this.ip + ":" + this.port;
	}

	this.url = 'http://' + this.uri;
	this.ws = 'ws://' + this.uri;
}

module.exports = SignalKServer;

SignalKServer.prototype.getHost = function() {
	return this.host;
};

SignalKServer.prototype.getPort = function() {
	return this.port;
};

SignalKServer.prototype.getIP = function() {
	return this.ip;
};

SignalKServer.prototype.getURI = function() {
	return this.uri;
};

SignalKServer.prototype.getURL = function() {
	return this.url;
};

SignalKServer.prototype.getWS = function() {
	return this.ws;
};
