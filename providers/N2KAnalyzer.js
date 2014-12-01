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

var stream = require('stream');
var util = require('util');

var Transform = stream.Transform

var AnalyzerStream = function AnalyzerStream() {
  this.analyzerProcess = require('child_process').spawn('sh', ['-c','analyzer -json']);
  this.analyzerProcess.stderr.on('data', function (data) { console.error(data.toString());});
  this.analyzerProcess.on('close', function (code) { console.error('Analyzer process exited with code ' + code);});

  this.linereader = require('readline').createInterface(this.analyzerProcess.stdout, this.analyzerProcess.stdin);
  var that = this;
  this.linereader.on('line', function (data) {
    try {
      that.push(JSON.parse(data));
    } catch (ex) {
      console.error(ex.stack);
    }
  });

  Transform.call(this);
  this._readableState.objectMode = true;
}
util.inherits(AnalyzerStream, Transform);

AnalyzerStream.prototype._transform = function (chunk, enc, callback) {
  this.analyzerProcess.stdin.write(chunk.toString() + '\n');
  callback();
};

module.exports = AnalyzerStream;

