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

/* Usage: This is the first pipeElement in a PipedProvider. Used to pass data input from Serial to the next pipeElement. 
 * Reads data from a serial device and allows writing back to serial with the "toStdout" option 
 * It takes two options; "device" and "baudrate". The "toStdout" option is not mandatory.
 * Example:

 {
   "type": "providers/serialport",
   "options": {
     "device": "/dev/ttyUSB0",
     "baudrate": 4800
   },
   "optionMappings": [
     {
       "fromAppProperty": "argv.nmeadevice",
       "toOption": "device"
     },

     {
       "fromAppProperty": "argv.nmeabaudrate",
       "toOption": "baudrate"
     }
   ]
 },

 */

var Transform = require("stream").Transform;
var SerialPort = require("serialport");

function SerialStream(options) {
  if (!(this instanceof SerialStream)) {
    return new SerialStream(options);
  }

  Transform.call(this, options);

  this.reconnect = options.reconnect || true;
  this.serial = null;
  this.options = options;
  this.start();
}

require("util").inherits(SerialStream, Transform);

SerialStream.prototype.start = function() {
  if (this.serial !== null) {
    this.serial.unpipe(this);
    this.serial.removeAllListeners();
    this.serial = null;
  }

  if (this.reconnect === false) {
    return;
  }

  this.serial = new SerialPort(this.options.device, {
    baudRate: this.options.baudrate,
    parser: SerialPort.parsers.readline("\n")
  });

  this.serial.on(
    "open",
    function() {
      this.serial.pipe(this);
    }.bind(this)
  );

  this.serial.on("error", function(x) {
    console.log(x);
  });
  this.serial.on("close", this.start.bind(this));

  var that = this;
  const stdOutEvent = this.options.toStdout;
  if (stdOutEvent) {
    this.options.app.on(stdOutEvent, function(d) {
      that.serial.write(d + "\n");
    });
  }
};

SerialStream.prototype.end = function() {
  this.reconnect = false;
  this.start();
};

SerialStream.prototype._transform = function(chunk, encoding, done) {
  this.push(chunk);
  done();
};

module.exports = SerialStream;
