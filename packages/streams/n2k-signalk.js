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

const Transform = require('stream').Transform

const toDelta = require('@signalk/n2k-signalk').toDelta


//these PGNs contain details about the devices in the network, so let them pass through so they get into /sources
const passthroughPGNs = [ 126996, 126998, 60928 ]

require('util').inherits(ToSignalK, Transform)

function ToSignalK (options) {
  Transform.call(this, {
    objectMode: true
  })
  this.state = { app: options.app }
  this.notifications = {}
  this.options = options
  this.app = options.app
}

ToSignalK.prototype._transform = function (chunk, encoding, done) {
  try {
    const delta = toDelta(chunk, this.state)

    if (delta && delta.updates[0].values.length > 0) {
      delta.updates.forEach(update => {
          update.values.forEach(kv => {
            if ( kv.path && kv.path.startsWith('notifications.') ) {
              if ( kv.value.state === 'normal' && this.notifications[kv.path]) {
                clearInterval(this.notifications[kv.path].interval)
                delete this.notifications[kv.path]
              } else if ( kv.value.state !== 'normal' ) {
                if ( !this.notifications[kv.path] ) {
                  const interval = setInterval(() => {
                    if (Date.now() - this.notifications[kv.path].lastTime > 10000) {
                      const copy = JSON.parse(JSON.stringify(kv))
                      copy.value.state = 'normal'
                      const normalDelta = {
                        context: delta.context,
                        updates: [
                          {
                            values: [ copy ]
                          }
                        ]
                      }
                      delete this.notifications[kv.path]
                      clearInterval(interval)
                      this.app.handleMessage(this.options.providerId, normalDelta)
                    }
                  }, 5000)
                  this.notifications[kv.path] = {
                    lastTime: Date.now(),
                    interval: interval
                  }
                } else {
                  this.notifications[kv.path].lastTime = Date.now()
                }
              }
            }
          })
      })
      this.push(delta)
    } else if ( delta &&
                passthroughPGNs.find(pgn => { return pgn == delta.updates[0].source.pgn}) ) {
      this.push(delta)
    }
  } catch (ex) {
    console.error(ex)
  }
  done()
}

module.exports = ToSignalK
