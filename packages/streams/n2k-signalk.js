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

const N2kMapper = require('@signalk/n2k-signalk').N2kMapper

const { getSourceId } = require('@signalk/signalk-schema')

require('util').inherits(ToSignalK, Transform)

function ToSignalK (options) {
  Transform.call(this, {
    objectMode: true
  })
  this.sourceMeta = {}
  this.notifications = {}
  this.options = options
  this.app = options.app


  this.n2kMapper = new N2kMapper(options)

  this.n2kMapper.on('n2kOut', (pgn) => this.app.emit('nmea2000JsonOut', pgn))

  this.n2kMapper.on('n2kSourceMetadata', (n2k, meta) => {
    const existing = this.sourceMeta[n2k.src] || {}
    this.sourceMeta[n2k.src] = {
      ...existing,
      ...meta
    }
    const delta = {
      context: this.app.selfContext,
      updates: [
        {
          source: {
            ...this.sourceMeta[n2k.src],
            label: this.options.providerId,
            type: 'NMEA2000',
            pgn: Number(n2k.pgn),
            src: n2k.src.toString()
          },
          timestamp:
            n2k.timestamp.substring(0, 10) +
            'T' +
            n2k.timestamp.substring(11, n2k.timestamp.length),
          values: []
        }
      ]
    }
    this.app.deltaCache.setSourceDelta(`${this.options.providerId}.${n2k.src}`, delta)
  })

  setTimeout(() => {
    this.n2kMapper.emit('n2kRequestMetadata', 255)
  }, 5000)
}

ToSignalK.prototype._transform = function (chunk, encoding, done) {
  try {

    const src = Number(chunk.src)
    if ( !this.sourceMeta[src] ) {
      this.sourceMeta[src] = {}
      this.n2kMapper.emit('n2kRequestMetadata', src)
    }
    
    const delta = this.n2kMapper.toDelta(chunk)

    if (delta && delta.updates[0].values.length > 0) {
      delta.updates.forEach(update => {
          update.values.forEach(kv => {
            if ( kv.path && kv.path.startsWith('notifications.') ) {
              const source = update.source.src
              if ( kv.value.state === 'normal' && this.notifications[kv.path] && this.notifications[kv.path][src]) {
                clearInterval(this.notifications[kv.path][src].interval)
                delete this.notifications[kv.path][src]
              } else if ( kv.value.state !== 'normal' ) {
                if ( !this.notifications[kv.path] ) {
                  this.notifications[kv.path] = {}
                }
                if ( !this.notifications[kv.path][src] ) {
                  const interval = setInterval(() => {
                    if (Date.now() - this.notifications[kv.path][src].lastTime > 10000) {
                      const copy = JSON.parse(JSON.stringify(kv))
                      copy.value.state = 'normal'
                      const normalDelta = {
                        context: delta.context,
                        updates: [
                          {
                            source: update.source,
                            $source: getSourceId(update.source),
                            values: [ copy ]
                          }
                        ]
                      }
                      delete this.notifications[kv.path][src]
                      clearInterval(interval)
                      this.app.handleMessage(this.options.providerId, normalDelta)
                    }
                  }, 5000)
                  this.notifications[kv.path][src] = {
                    lastTime: Date.now(),
                    interval: interval
                  }
                } else {
                  this.notifications[kv.path][src].lastTime = Date.now()
                }
              }
            }
          })
      })
      this.push(delta)
    }
  } catch (ex) {
    console.error(ex)
  }
  done()
}

module.exports = ToSignalK
