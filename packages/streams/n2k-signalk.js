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

require('util').inherits(ToSignalK, Transform)

const aisPGNs = [129794, 129810, 129040, 130842, 129809]

function ToSignalK(options) {
  Transform.call(this, {
    objectMode: true,
  })
  const n2kOutEvent = 'nmea2000JsonOut'
  this.sourceMeta = {}
  this.notifications = {}
  this.options = options
  this.app = options.app
  if (options.filters && options.filtersEnabled) {
    this.filters = options.filters.filter((f) => {
      return (f.source && f.source.length) || (f.pgn && f.pgn.length)
    })
  }

  this.n2kMapper = new N2kMapper({ ...options, sendMetaData: true })

  this.n2kMapper.on('n2kOut', (pgn) => this.app.emit('nmea2000JsonOut', pgn))

  this.n2kMapper.on('n2kSourceMetadata', (n2k, meta) => {
    const existing = this.sourceMeta[n2k.src] || {}
    this.sourceMeta[n2k.src] = {
      ...existing,
      ...meta,
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
            src: n2k.src.toString(),
          },
          timestamp:
            n2k.timestamp.substring(0, 10) +
            'T' +
            n2k.timestamp.substring(11, n2k.timestamp.length),
          values: [],
        },
      ],
    }
    this.app.deltaCache.setSourceDelta(
      `${this.options.providerId}.${n2k.src}`,
      delta
    )
  })

  this.n2kMapper.on('n2kSourceMetadataTimeout', (pgn, src) => {
    if (pgn == 60928) {
      console.warn(`n2k-signalk: unable to detect can name for src ${src}`)
      this.sourceMeta[src].unknowCanName = true
    }
  })

  this.n2kMapper.on('n2kSourceChanged', (src, from, to) => {
    console.warn(`n2k-signalk: address ${src} changed from ${from} ${to}`)
    if (this.sourceMeta[src]) {
      delete this.sourceMeta[src]
    }
  })

  if (this.app.isNmea2000OutAvailable) {
    this.n2kMapper.n2kOutIsAvailable(this.app, n2kOutEvent)
  } else {
    this.app.on('nmea2000OutAvailable', () =>
      this.n2kMapper.n2kOutIsAvailable(this.app, n2kOutEvent)
    )
  }
}

ToSignalK.prototype.isFiltered = function (source) {
  return (
    this.filters &&
    this.filters.find((filter) => {
      const sFilter = this.options.useCanName ? source.canName : source.src
      return (
        (!filter.source ||
          filter.source.length === 0 ||
          filter.source == sFilter) &&
        (!filter.pgn || filter.pgn.length === 0 || filter.pgn == source.pgn)
      )
    })
  )
}

ToSignalK.prototype.filterSelfAISStatic = function (values) {
  return values.filter((kv) => {
    return (
      kv.path !== '' &&
      this.app.config.baseDeltaEditor.getSelfValue(kv.path) === undefined
    )
  })
}

ToSignalK.prototype._transform = function (chunk, encoding, done) {
  try {
    const delta = this.n2kMapper.toDelta(chunk)

    const src = Number(chunk.src)
    if (!this.sourceMeta[src]) {
      this.sourceMeta[src] = {}
    }

    if (
      delta &&
      delta.updates[0].values.length > 0 &&
      !this.isFiltered(delta.updates[0].source)
    ) {
      if (!this.options.useCanName) {
        delete delta.updates[0].source.canName
      }

      const canName = delta.updates[0].source.canName

      if (
        this.options.useCanName &&
        !canName &&
        !this.sourceMeta[src].unknowCanName
      ) {
        done()
        return
      }

      //filter out static AIS data for self if configured
      if (
        delta.context == this.app.selfContext &&
        aisPGNs.indexOf(chunk.pgn) !== -1
      ) {
        delta.updates[0].values = this.filterSelfAISStatic(
          delta.updates[0].values
        )
      }

      delta.updates.forEach((update) => {
        update.values.forEach((kv) => {
          if (kv.path && kv.path.startsWith('notifications.')) {
            if (
              kv.value.state === 'normal' &&
              this.notifications[kv.path] &&
              this.notifications[kv.path][src]
            ) {
              clearInterval(this.notifications[kv.path][src].interval)
              delete this.notifications[kv.path][src]
            } else if (kv.value.state !== 'normal') {
              if (!this.notifications[kv.path]) {
                this.notifications[kv.path] = {}
              }
              if (!this.notifications[kv.path][src]) {
                const interval = setInterval(() => {
                  if (
                    Date.now() - this.notifications[kv.path][src].lastTime >
                    10000
                  ) {
                    const copy = JSON.parse(JSON.stringify(kv))
                    copy.value.state = 'normal'
                    const normalDelta = {
                      context: delta.context,
                      updates: [
                        {
                          source: update.source,
                          values: [copy],
                        },
                      ],
                    }
                    delete this.notifications[kv.path][src]
                    clearInterval(interval)
                    this.app.handleMessage(this.options.providerId, normalDelta)
                  }
                }, 5000)
                this.notifications[kv.path][src] = {
                  lastTime: Date.now(),
                  interval: interval,
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
