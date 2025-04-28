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

function MdnsWs(options) {
  Transform.call(this, {
    objectMode: true
  })
  this.options = options
  this.selfHost = options.app.config.getExternalHostname() + '.'
  this.selfPort = options.app.config.getExternalPort()
  this.remoteServers = {}
  this.remoteServers[this.selfHost + ':' + this.selfPort] = {}
  const deltaStreamBehaviour = options.subscription ? 'none' : 'all'

  const createDebug = options.createDebug || require('debug')
  this.debug = createDebug('signalk:streams:mdns-ws')
  this.dataDebug = createDebug('signalk:streams:mdns-ws-data')
  this.debug(`deltaStreamBehaviour:${deltaStreamBehaviour}`)

  this.handleContext = () => {}
  if (options.selfHandling === 'manualSelf') {
    if (options.remoteSelf) {
      this.debug(`Using manual remote self ${options.remoteSelf}`)
      this.handleContext = (delta) => {
        if (delta.context === options.remoteSelf) {
          delete delta.context
        }
      }
    } else {
      console.error(
        'Manual self handling speficied but no remoteSelf configured'
      )
    }
  }

  if (options.ignoreServers) {
    options.ignoreServers.forEach((s) => {
      this.remoteServers[s] = {}
    })
  }
  if (options.host && options.port) {
    this.signalkClient = new SignalK.Client({
      hostname: options.host,
      port: options.port,
      useTLS: options.type === 'wss',
      reconnect: true,
      notifications: false,
      autoConnect: false,
      deltaStreamBehaviour,
      rejectUnauthorized: !(options.selfsignedcert === true),
      wsKeepaliveInterval: 10
    })
    this.connect(this.signalkClient)
  } else {
    this.options.app.setProviderError(
      this.options.providerId,
      'This connection is deprecated and must be deleted'
    )
    return
  }
}

require('util').inherits(MdnsWs, Transform)

function setProviderStatus(that, providerId, message, isError) {
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

  client
    .connect()
    .then(() => {
      setProviderStatus(
        that,
        that.options.providerId,
        `ws connection connected to ${client.options.hostname}:${client.options.port}`
      )
      if (this.options.selfHandling === 'useRemoteSelf') {
        client
          .API()
          .then((api) => api.get('/self'))
          .then((selfFromServer) => {
            that.debug(
              `Mapping context ${selfFromServer} to self (empty context)`
            )
            this.handleContext = (delta) => {
              if (delta.context === selfFromServer) {
                delete delta.context
              }
            }
          })
          .catch((err) => {
            console.error('Error retrieving self from remote server')
            console.error(err)
          })
      }
      that.remoteServers[client.options.hostname + ':' + client.options.port] =
        client
      if (that.options.subscription) {
        let parsed
        try {
          parsed = JSON.parse(that.options.subscription)
        } catch (ex) {
          setProviderStatus(
            that,
            that.options.providerId,
            `unable to parse subscription json: ${that.options.subscription}: ${ex.message}`,
            true
          )
        }
        if (!Array.isArray(parsed)) {
          parsed = [parsed]
        }
        parsed.forEach((sub, idx) => {
          that.debug('sending subscription %j', sub)
          client.subscribe(sub, String(idx))
        })
      }
    })
    .catch((err) => {
      setProviderStatus(that, that.options.providerId, err.message, true)
    })

  client.on('delta', (data) => {
    if (data && data.updates) {
      that.handleContext(data)
      if (that.dataDebug.enabled) {
        that.dataDebug(JSON.stringify(data))
      }
      data.updates.forEach(function (update) {
        update['$source'] =
          `${that.options.providerId}.${client.options.hostname}:${client.options.port}`
      })
    }

    that.push(data)
  })
}

MdnsWs.prototype._transform = function () {}

module.exports = MdnsWs
