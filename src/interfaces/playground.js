/*
 * Copyright 2020 Scott Bender <scott@scottbender.net>
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

import Parser0183 from '@signalk/nmea0183-signalk'
import { N2kMapper } from '@signalk/n2k-signalk'
import { putPath, deletePath } from '../put.js'
import canboat from '@canboat/canboatjs'

const { isN2KString, FromPgn, pgnToActisenseSerialFormat } = canboat // canboat is not ESM compatible
const serverRoutesPrefix = '/skServer'

let n2kOutAvailable = false

export default function (app) {
  const n2kMapper = new N2kMapper({ app }, app.propertyValues)
  const pgnParser = new FromPgn({}, app.propertyValues)

  app.on('nmea2000OutAvailable', () => {
    n2kOutAvailable = true
  })

  const processors = {
    n2k: (msgs, sendToServer) => {
      const n2kJson = []
      const deltas = msgs.map((msg) => {
        const n2k = pgnParser.parseString(msg)
        if (n2k) {
          if (sendToServer) {
            app.emit('N2KAnalyzerOut', n2k)
          }
          n2kJson.push(n2k)
          return n2kMapper.toDelta(n2k)
        }
      })
      return { deltas, n2kJson: n2kJson, n2kOutAvailable }
    },
    '0183': (msgs) => {
      const parser = new Parser0183({ app })
      return { deltas: msgs.map(parser.parse.bind(parser)) }
    },
    'n2k-json': (msgs) => {
      return processors.n2k(msgs.map(pgnToActisenseSerialFormat))
    }
  }

  function detectType(message) {
    let type
    let msg = message.trim()
    if (msg.charAt(0) === '{' || msg.charAt(0) === '[') {
      try {
        const parsed = JSON.parse(msg)
        const first = Array.isArray(parsed) ? parsed[0] : parsed

        if (first.pgn) {
          type = 'n2k-json'
        } else if (first.updates || first.put || first.delete) {
          type = 'signalk'
        } else {
          return { error: 'unknown JSON format' }
        }
        const msgs = Array.isArray(parsed) ? parsed : [parsed]
        return { type, msgs }
      } catch (ex) {
        console.error(ex)
        return { error: ex.message }
      }
    } else if (isN2KString) {
      // temporary until new canboatjs is released
      if (isN2KString(msg)) {
        type = 'n2k'
      } else if (msg.charAt(0) === '$' || msg.charAt(0) === '!') {
        type = '0183'
      } else {
        return { error: 'unable to determine message type' }
      }
    } else if (msg.charAt(0) === '$' || msg.charAt(0) === '!') {
      type = '0183'
    } else {
      type = 'n2k'
    }
    return { type, msgs: msg.split('\n').filter((s) => s.length > 0) }
  }

  app.post(`${serverRoutesPrefix}/inputTest`, (req, res) => {
    const sendToServer = req.body.sendToServer
    const sendToN2K = req.body.sendToN2K

    if (
      (sendToServer || sendToN2K) &&
      !app.securityStrategy.isDummy() &&
      !app.securityStrategy.allowConfigure(req)
    ) {
      res.status(400).json({ error: 'permission denied' })
      return
    }

    const { type, msgs, error } = detectType(req.body.value)

    if (error) {
      res.status(400).json({ error: error })
      return
    }

    if (sendToN2K && type != 'n2k-json' && type != 'n2k') {
      res.status(400).json({
        error: 'Please enter NMEA 2000 json format or Actisense format'
      })
      return
    }

    if (type === 'signalk') {
      let puts = []
      if (sendToServer) {
        msgs.forEach((msg) => {
          if (msg.put) {
            puts.push(
              new Promise((resolve) => {
                setTimeout(() => {
                  resolve('Timed out waiting for put result')
                }, 5000)
                putPath(
                  app,
                  msg.context,
                  msg.put.path,
                  msg.put,
                  req,
                  msg.requestId,
                  (reply) => {
                    if (reply.state !== 'PENDING') {
                      resolve(reply)
                    }
                  }
                )
              })
            )
          } else if (msg.delete) {
            puts.push(
              new Promise((resolve) => {
                setTimeout(() => {
                  resolve('Timed out waiting for put result')
                }, 5000)
                deletePath(
                  app,
                  msg.context,
                  msg.delete.path,
                  req,
                  msg.requestId,
                  (reply) => {
                    if (reply.state !== 'PENDING') {
                      resolve(reply)
                    }
                  }
                )
              })
            )
          } else {
            app.handleMessage('input-test', msg)
          }
        })
      }
      if (puts.length > 0) {
        Promise.all(puts).then((results) => {
          res.json({ deltas: msgs, putResults: results })
        })
      } else {
        res.json({ deltas: msgs })
      }
    } else if (sendToN2K) {
      const event = type == 'n2k' ? 'nmea2000out' : 'nmea2000JsonOut'
      msgs.forEach((msg) => {
        app.emit(event, msg)
      })
      res.json({ deltas: [] })
    } else {
      try {
        const data = processors[type](msgs, sendToServer)

        if (data.deltas) {
          data.deltas = data.deltas.filter(
            (m) =>
              typeof m !== 'undefined' &&
              m != null &&
              m.updates.length > 0 &&
              m.updates[0].values &&
              m.updates[0].values.length > 0
          )
        }
        res.json(data)

        if (sendToServer) {
          data.deltas.forEach((msg) => {
            app.handleMessage('input-test', msg)
          })
        }
      } catch (ex) {
        console.error(ex)
        res.status(400).json({ error: ex.message })
      }
    }
  })
}
