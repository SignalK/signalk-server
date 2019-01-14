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

const Transform = require('stream').Transform

const SignalK = require('@signalk/client')

const debug = require('debug')('signalk-server:providers:mdns-ws')

const WebSocket = require('ws')
const _object = require('lodash/object')
const _keys = require('lodash/keys')

function MdnsWs (options) {
  Transform.call(this, {
    objectMode: true
  })
  this.options = options
  this.selfHost = options.app.config.getExternalHostname() + '.'
  this.selfPort = options.app.config.getExternalPort()
  this.remoteServers = {}
  this.remoteServers[this.selfHost + ':' + this.selfPort] = {}
  if (options.ignoreServers) {
    options.ignoreServers.forEach(s => {
      this.remoteServers[s] = {}
    })
  }
  if (options.host && options.port) {
    this.connect(options)
  } else {
    this.signalkClient = new SignalK.Client()
    this.signalkClient.on('discovery', this.connect.bind(this))
    this.signalkClient.on('discoveryError', info => {
      const providerId = `${options.providerId}.${info.host}:${info.port}`
      options.app.setProviderError(providerId, info.error.message)
    })
    debug('Starting discovery')
    this.signalkClient.startDiscovery()
  }
}

require('util').inherits(MdnsWs, Transform)

function setProviderStatus (that, providerId, message, isError) {
  if (!isError) {
    that.options.app.setProviderStatus(providerId, message)
  } else {
    that.options.app.setProviderError(providerId, message)
  }
}

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
  const signalkClient = new SignalK.Client()
  let url
  if (discovery.discoveryResponse) {
    _object.values(discovery.discoveryResponse.endpoints)[0]['signalk-ws']
  } else {
    const protocol = discovery.protocol || 'ws'
    url =
      protocol +
      '://' +
      discovery.host +
      ':' +
      discovery.port +
      '/signalk/v1/stream?subscribe=all'
  }
  const that = this

  const providerId = `${that.options.providerId}.${discovery.host}:${
    discovery.port
  }`

  const onData = function (data) {
    if (data && data.updates) {
      data.updates.forEach(function (update) {
        update['$source'] = providerId
      })
    }

    that.push(data)
  }

  const start = () => {
    const msg = `Trying url: ${url}`
    debug(msg)
    setProviderStatus(that, providerId, msg, false)
    signalkClient.connectDeltaByUrl(
      url,
      onData,
      () => {
        console.log('ws connection connected')
      },
      () => {
        console.log('ws connection disconnected')
      },
      err => {
        console.error(err)
      },
      () => {
        console.log('ws connection closed')
      }
    )
  }
  onConnect = function (connection) {
    that.remoteServers[discovery.host + ':' + discovery.port] = {}
    const msg = 'Connected to ' + url
    setProviderStatus(that, providerId, msg, false)
    debug(msg)
    connection.subscribeAll()
  }
  onDisconnect = function () {
    const msg = 'Disconnected from ' + url
    setProviderStatus(that, providerId, msg, true)
    debug(msg)
  }
  onClose = function () {
    const msg = 'Connection closed from ' + url
    setProviderStatus(that, providerId, msg, true)
    debug(msg)
    if (that.options.host && that.options.port) {
      setTimeout(start, 5000)
    } else {
      delete that.remoteServers[discovery.host + ':' + discovery.port]
    }
  }
  onError = function (err) {
    setProviderStatus(that, providerId, err.message, true)
    debug('Error:' + err)
  }
  start()
}

MdnsWs.prototype._transform = function (chunk, encoding, done) {}

module.exports = MdnsWs
