/*
 * Copyright 2016 Teppo Kurki <teppo.kurki@iki.fi>
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

var Transform = require('stream').Transform;

var SignalK = require('signalk-client');

var debug = require('debug')('signalk-server:providers:mdns-ws');

var WebSocket = require('ws');
var _object = require('lodash/object');

function MdnsWs(options) {
  debug("MdnsWs");
  Transform.call(this, {
    objectMode: true
  });
  this.signalkClient = new SignalK.Client();
  this.signalkClient.on('endpoints', this.connect.bind(this));
  this.signalkClient.startDiscovery();
  debug("MdnsWs");
}

require('util').inherits(MdnsWs, Transform);

MdnsWs.prototype.connect = function(endpoints) {
  var signalkClient = new SignalK.Client();
  var url = _object.values(endpoints)[0]['signalk-ws'];
  var onConnect = function(connection) {
    debug("Connected to " + url);
    connection.subscribeAll();
  }
  var onDisconnect = function() {
    debug("Disconnected from " + url);
  }
  var onError = function(err) {
    debug("Error:" + err);
  }
  signalkClient.connectDeltaByUrl(url, this.push.bind(this), onConnect, onDisconnect, onError);
}


MdnsWs.prototype._transform = function(chunk, encoding, done) {}

module.exports = MdnsWs;
