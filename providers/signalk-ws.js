/*
 * Copyright 2016 Ilker Temir <ilker@ilkertemir.com> based on code
 * by Teppo Kurki <teppo.kurki@iki.fi>
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

var debug = require('debug')('signalk-server:providers:signalk-ws');

var WebSocket = require('ws');

function SignalKWs(options) {
  Transform.call(this, {
    objectMode: true
  });
  this.selfHost = options.app.config.getExternalHostname() + ".";
  this.selfPort = options.app.config.getExternalPort();
  this.remoteServers = {};
  this.remoteServers[this.selfHost + ":" + this.selfPort] = {};
  this.signalkClient = new SignalK.Client();
  var url = "ws://" + options.host + ":" + options.port + options.path;
  var that = this;
  var onConnect = function(connection) {
    that.remoteServers[options.host + ":" + options.port] = {};
    debug("Connected to " + url);
    connection.subscribeAll();
  }
  var onDisconnect = function() {
    debug("Disconnected from " + url);
  }
  var onError = function(err) {
    debug("Error:" + err);
  }
  this.signalkClient.connectDeltaByUrl(url, this.push.bind(this), onConnect, onDisconnect, onError);
}

require('util').inherits(SignalKWs, Transform);

SignalKWs.prototype._transform = function(chunk, encoding, done) {}

module.exports = SignalKWs;
