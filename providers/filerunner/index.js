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

 
if(typeof process.send !== 'function') {
	return process.exit();
}

var Parser, fs, reader, filestream, parser, mw, colors, counter, Throttle, throttled, last;

colors 		= require('colors');
// mw 		= require('memwatch');
fs 			= require('fs');
Parser 		= require('nmea0183-signalk').Parser;
Throttle 	= require('stream-throttle').Throttle;
// counter 	= Date.now();
// last 	= Date.now();

process.send({
	messageType: 'identity', // in order to find out if the message contains actual data or the Provider's identity
	payload: {
		name: 'filerunner', // name of Provider
		version: '0.0.1', // version of Provider
		author: 'Fabian Tollenaar <fabian@starting-point.nl>', // author of Provider
		provides: 'Loops through a log file of nmea0183 sentences', // description of what the Provider provides
		capabilities: ['nmea0183'], // capabilities/tags
		protocol: 'Signal K', // protocol of the actual data. Should be signal K
		
		device: { // device information
			protocol: 'nmea0183', // original protocol
			type: 'file', // device type
			location: './nmea.log', // device location
			manufacturer: '-', // device manufacturer
			product: '-', // product identifier
			serial: '-' // serial number
		}
	}
});

function reader() {
	filestream = fs.createReadStream(__dirname + '/nmea.log');
	
	parser = new Parser({ 
		vessel: {},
		debug: false
	});

	throttled = new Throttle({
		rate: 672
	});

	filestream.pipe(throttled);
	throttled.pipe(parser);

	parser.on('sentence', function(data) {
		process.send(data);
	});

	filestream.on('end', function() {
		filestream = null;
		parser = null; 

		setTimeout(function() {
			// console.log(((Date.now() - counter) / 1000) + "s. elapsed. Restarting reader.");
			// counter = Date.now();
			reader();
		}, 200);
	});
}

reader();


