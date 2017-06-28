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

/* Usage:
 * As part of a PipedProvider in a settings file. Lets you pass a command to the server, as set in the options. 
 * Also allows writing to stdout, for example with actisense-serial N2K data
 * see https://github.com/tkurki/cassiopeia-settings/blob/master/signalk-server-settings.json
 * Example from https://github.com/SignalK/signalk-server-node/blob/master/settings/actisense-serial-settings.json#L12

  {
   "type": "providers/execute",
      "options": {
        "command": "actisense-serial /dev/tty.usbserial-1FD34"
      }
  }
  
 *
 * It may also be other commands such as "./aisdeco --gain 33.8 --freq-correction 60 --freq 161975000 --freq 162025000 --net 30007 --udp 5.9.207.224:5351" for starting an AID reception with a USB SRD dongle
 */

var Transform = require("stream").Transform;
var debug = require("debug")("signalk:executor");

function Execute(options) {
  Transform.call(this, {});
  this.options = options;
}

require("util").inherits(Execute, Transform);

Execute.prototype._transform = function(chunk, encoding, done) {
  var data = chunk.toString();
  this.analyzerProcess.stdin.write(chunk.toString());
  done();
};
Execute.prototype.pipe = function(pipeTo) {
  this.pipeTo = pipeTo;
  if (process.platform == "win32")
    this.childProcess = require("child_process").spawn("cmd", [
      "/c",
      this.options.command
    ]);
  else
    this.childProcess = require("child_process").spawn("sh", [
      "-c",
      this.options.command
    ]);
  this.childProcess.stderr.on("data", function(data) {
    console.error(data.toString());
  });
  var that = this;
  this.childProcess.stdout.on("data", function(data) {
    that.push(data);
  });

  const stdOutEvent = this.options.toChildProcess || "toChildProcess";
  debug("Using event " + stdOutEvent + " for output to child process's stdin");
  this.options.app.on(stdOutEvent, function(d) {
    that.childProcess.stdin.write(d + "\n");
  });

  Execute.super_.prototype.pipe.call(this, pipeTo);
};

Execute.prototype.end = function() {
  debug("end, killing child  process");
  this.childProcess.kill();
  this.pipeTo.end();
};

module.exports = Execute;
