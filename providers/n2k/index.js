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


exports.init = function (theProvider, send, _debug) {
  var debug = !!_debug;

  send({
    messageType: 'identity', // in order to find out if the message contains actual data or the Provider's identity
    payload: {
      name: theProvider.name,
      provider: theProvider.file,
      version: '0.0.0',
      provides: 'Loops through a log file of n2k sentences in actisense-serial format',
      capabilities: ['n2k'],
      protocol: 'Signal K',

      device: {
        name: theProvider.name,
        provider: theProvider.file,
        protocol: 'actisense-serial-n2k',
        type: 'file',
        location: '-'
      }
    }
  });


  var path = require('path');
  var analyzerStream = new (require('./AnalyzerStream.js'))();
  var n2kToSignalKTransformer = require('n2k-signalk').toNestedTransformer({});
  analyzerStream.pipe(n2kToSignalKTransformer);

  n2kToSignalKTransformer.on('data', function (chunk) {
    send(chunk);
  });

  var filename = path.join(process.cwd(), (theProvider.app.argv.n2kfile || theProvider.settings.options.filename));
  createFileReader(filename, analyzerStream);
}

function createFileReader(filename, analyzerStream) {
  var LineByLineReader = require('line-by-line');
  var lr = new LineByLineReader(filename);

  lr.on('line', function (line) {
    lr.pause();
    analyzerStream.write(line);
    setTimeout(function () {
      lr.resume();
    }, 1000);
  });

  lr.on('end', function () {
    process.nextTick(function () {
      createFileReader(filename, analyzerStream);
    })
  });
}
