/*
 * 
 * NMEA 0183 GPS Provider for Saildata 
 * 
 * @author 			Fabian Tollenaar <fabian@starting-point.nl>
 * @description		Simple provider that receives GPS data over serial and transforms the output into a Signal K object.
 * @copyright		2014 Fabian Tollenaar, All rights reserved
 * 
 * @dependencies	voodootikigod/node-serialport, jamesp/node-nmea
 * 
 * @todo 			come up with a better way to handle configuration for Providers.
 * 
 * 
 */

var config 		= require('./config.json');
var receiver 	= config.address;
var serialport 	= require('serialport');
var signalk 	= require('./signalk');
var util 		= require('util');

var port = new serialport.SerialPort(receiver, {
	baudrate: config.baudrate,
	parser: serialport.parsers.readline('\r\n')
});

port.on('data', function(line) {
	var data = signalk.parse(line);
	
	if(data !== null) {
		if(typeof process.send === 'function') {
			process.send({
				messageType: 'data',
				payload: data
			});
		} else {
			// If this provider is ran as a separate object, just output Signal K to stdout.
			util.log("Received new Signal K object:")
			console.log(JSON.stringify(data, null, 4));
			console.log("\n");
		}
	}
});