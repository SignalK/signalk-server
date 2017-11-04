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

var Transform = require('stream').Transform

var SignalK = require('signalk-client')

var debug = require('debug')('signalk-server:providers:mdns-ws')

var WebSocket = require('ws')
var _object = require('lodash/object')

function MdnsWs (options) {
  Transform.call(this, {
    objectMode: true
  })
  this.selfHost = options.app.config.getExternalHostname() + '.'
  this.selfPort = options.app.config.getExternalPort()
  this.remoteServers = {}
  this.remoteServers[this.selfHost + ':' + this.selfPort] = {}
  if (options.host && options.port) {
    this.connect(options)
  } else {
    this.signalkClient = new SignalK.Client()
    this.signalkClient.on('discovery', this.connect.bind(this))
    debug('Starting discovery')
    this.signalkClient.startDiscovery()
  }
}

require('util').inherits(MdnsWs, Transform)

MdnsWs.prototype.connect = function (discovery) {
  if (this.remoteServers[discovery.host + ':' + discovery.port]) {
    debug(
      'Discovered ' +
        discovery.host +
        ':' +
        discovery.port +
        ' already known, not connecting'
    )
    return
  }
  var signalkClient = new SignalK.Client()
  var url
  if (discovery.discoveryResponse) {
    _object.values(discovery.discoveryResponse.endpoints)[0]['signalk-ws']
  } else {
    url =
      'ws://' +
      discovery.host +
      ':' +
      discovery.port +
      '/signalk/v1/stream?subscribe=all'
  }
  var that = this
  var onConnect = function (connection) {
    that.remoteServers[discovery.host + ':' + discovery.port] = {}
    debug('Connected to ' + url)
    connection.subscribeAll()
  }
  var onDisconnect = function () {
    debug('Disconnected from ' + url)
  }
  var onError = function (err) {
    debug('Error:' + err)
  }
  signalkClient.connectDeltaByUrl(
    url,
    this.push.bind(this),
    onConnect,
    onDisconnect,
    onError
  )
}

MdnsWs.prototype._transform = function (chunk, encoding, done) {}

module.exports = MdnsWs
