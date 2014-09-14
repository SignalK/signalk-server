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

exports.init = function(app, send, _debug) {
  var command   = typeof app.argv['execute'] === 'string' ? app.argv['execute'] : false;
  
  if(!command) return false;

  var debug     = !!_debug;
  var spawn     = require('child_process').spawn;

  /* SEND IDENTITY ON FORK START */
  send({
    messageType: 'identity', // in order to find out if the message contains actual data or the Provider's identity
    payload: {
      name: 'execute', // name of Provider
      version: '0.0.1', // version of Provider
      author: 'Fabian Tollenaar <fabian@starting-point.nl>', // author of Provider
      provides: 'Execute any (Signal K producing) command set by user.', // description of what the Provider provides
      capabilities: ['*'], // capabilities/tags
      protocol: 'Signal K', // protocol of the actual data. Should be signal K
      
      device: { // device information
        protocol: '-', // original protocol
        type: 'command', // device type
        location: '-', // device location
        manufacturer: '-', // device manufacturer
        product: '-', // product identifier
        serial: '-' // serial number
      }
    }
  });

  process.nextTick(function() {
    command = String(command).split(' ');
    command = spawn(command[0], command.slice(1));

    command.stdout.on('data', function(data) {
      try {
        send(JSON.parse(data.toString()));
      } catch(err) {
        if(debug === true) console.log('[provider-execute] error', err.toString());
      }
    });

    command.stderr.on('data', function(err) {
      if(debug === true) console.log('[provider-execute] error', err.toString());
    });

    command.on('exit', function(code) {
      if(debug === true) console.log('[provider-execute] exit', code);
    });
  });
}

