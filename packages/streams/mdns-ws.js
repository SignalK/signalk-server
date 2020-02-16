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
    this.signalkClient = new SignalK.Client({
      hostname: options.host,
      port: options.port,
      useTLS: options.protocol === 'wss',
      reconnect: true,
      autoConnect: false,
    })
    this.connect(this.signalkClient)
  } else {
    try {
      let mdns

      try {
        mdns = require('mdns')
      } catch ( ex ) {
        this.options.app.setProviderError(this.options.providerId, 'mdns module not installed')
        console.error(ex)
        return
      }

      const discovery = new SignalK.Discovery(mdns, 60000)
    
      debug('Starting discovery')
      
      discovery.on('timeout', () => console.log('No SK servers found'))
      
      discovery.on('found', server => {
        if (server.isMain() && server.isMaster()) {
          if ( !this.remoteServers[server.hostname + ':' + server.port] ) {
            client = server.createClient({
              useTLS: false,
              reconnect: true,
              autoConnect: false
            })
            this.connect(client)
          }
        }
      })
    } catch (ex) {
      this.options.app.setProviderError(this.options.providerId, ex.message)
      console.error(ex)
      return
    }
  }
}

require('util').inherits(MdnsWs, Transform)

function setProviderStatus (that, providerId, message, isError) {
  if (!isError) {
    that.options.app.setProviderStatus(providerId, message)
    console.log(message)
  } else {
    that.options.app.setProviderError(providerId, message)
    console.error(message)
  }
}

MdnsWs.prototype.connect = function (client) {
  const that = this
  const providerId = `${that.options.providerId}.${client.options.hostname}:${client.options.port}`
  
  client
    .connect()
    .then(() => {
      setProviderStatus(that, providerId, `ws connection connected to ${client.options.hostname}:${client.options.port}`)
      that.remoteServers[client.options.hostname + ':' + client.options.port] = client
      if ( that.options.subscription ) {
        let parsed 
        try {
          parsed = JSON.parse(that.options.subscription)
        } catch ( ex ) {
          setProviderStatus(that, providerId, `unable to parse subscription json: ${that.options.subscription}: ${ex.message}`, true)
        }
        if ( !Array.isArray(parsed) ) {
          parsed = [ parsed ]
        }
        parsed.forEach((sub, idx) => {
          debug('sending subscription %j', sub)
          client.subscribe(sub, String(idx))
        })
      } else {
        debug('subscribing to all')
        client.subscribe()
      }
    })
    .catch(err => {
      setProviderStatus(that, providerId, err.message, true)
    })
  
  client.on('delta', (data) => {
    if (data && data.updates) {
      data.updates.forEach(function (update) {
        update['$source'] = providerId
      })
    }
    
    that.push(data)
  })
}

MdnsWs.prototype._transform = function (chunk, encoding, done) {}

module.exports = MdnsWs
