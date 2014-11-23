/*
 * Copyright 2014-2015 Fabian Tollenaar <fabian@starting-point.nl>
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
