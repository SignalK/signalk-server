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

var net       = require('net')
  , Transform = require('stream').Transform
  , debug     = require('debug')('signalk-provider-tcp')
;

function TcpStream(options) {
  if(!(this instanceof TcpStream)) {
    return new TcpStream(options);
  }

  Transform.call(this, options);

  this.options    = options;
  this.reconnect  = options.reconnect || true;
  this.socket     = null;
  this.retries    = 0;
  this.maxRetries = options.maxRetries || 10;

  this.__reset    = null;
  this.__timeout  = null;
  this.__last     = -1;

  this.start();

  this.on('error', function(err) {
    debug('TcpStream', err);
  });
}

require('util').inherits(TcpStream, Transform);

TcpStream.prototype.handleTimeout = function() {
  if((Date.now() - this.__last) > 90000) {
    debug('Connection timed out. Resetting.');
    this.start();
  } else {
    if(this.__timeout !== null) {
      clearTimeout(this.__timeout);
    }

    this.__timeout = setTimeout(this.handleTimeout.bind(this), 120000);
  }
};

TcpStream.prototype.start = function() {
  if(this.socket !== null) {
    this.socket.unpipe(this);
    this.socket.removeAllListeners('error');
    this.socket.removeAllListeners('close');
    this.socket.removeAllListeners('end');
    this.socket.destroy();
    this.socket = null;
  }

  if(this.reconnect === true && this.socket === null) {
    if(this.__timeout !== null) {
      clearTimeout(this.__timeout);
    }

    this.socket = net.connect(this.options);

    if(this.__timeout !== null) {
      clearTimeout(this.__timeout);
    }

    this.__timeout = setTimeout(this.handleTimeout.bind(this), 120000);

    this.socket.on('close', function() {
      if(this.__reset === null) {
        this.start();
      }
    }.bind(this));

    this.socket.on('error', function(err) {
      debug(err.message);
      this.retries++;

      if(this.retries < this.maxRetries) {
        debug('Retrying... ' + this.retries + ' / ' + this.maxRetries);
        this.start();
      } else {
        debug('Out of retries. Retrying in a minute.');
        if(this.__reset === null) {
          this.__reset = setTimeout(function() {
            this.__timeout = null;
            this.maxRetries = 1;
            this.retries = 0;
            this.start();
          }.bind(this), 30000);
        }
      }
    }.bind(this));

    this.socket.pipe(this);
  }
};

TcpStream.prototype._transform = function(chunk, encoding, done) {
  // console.log(chunk.toString('utf8'));
  this.__last = Date.now();
  this.push(chunk);
  done();
};

TcpStream.prototype.end = function() {
  this.reconnect = false;
  this.start();
};

/* TESTING
var s = new TcpStream({
  host: '192.168.1.1',
  port: 2947
});

s.on('data', function(c) {
  var d = c.toString('utf8');
  if(d.indexOf('$YX') !== -1 || d.indexOf('$VW') !== -1 || d.indexOf('$SD') !== -1) {
    debug('RECEIVED WANTED SENTENCE: ' + d);
  }
});

s.on('error', function(e) {
  debug(e);
});
//*/

module.exports = TcpStream;
