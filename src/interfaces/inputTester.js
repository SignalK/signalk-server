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

const canboatjs = require('@signalk/streams/canboatjs')
const N2kToSignalK = require('@signalk/streams/n2k-signalk')
const nmea0183Signalk = require('@signalk/streams/nmea0183-signalk')
const {
  isN2KString,
  pgnToActisenseSerialFormat
} = require('@canboat/canboatjs')

const serverRoutesPrefix = '/skServer'

module.exports = function(app) {
  const typeStreams = {
    n2k: msgs => {
      return {
        pipeElements: [new canboatjs({ app }), new N2kToSignalK({ app })]
      }
    },
    '0183': msgs => {
      return {
        pipeElements: [new nmea0183Signalk({ app })]
      }
    },
    'n2k-json': msgs => {
      return {
        pipeElements: [new canboatjs({ app }), new N2kToSignalK({ app })],
        converter: pgnToActisenseSerialFormat
      }
    }
  }

  function detectType(msgs) {
    const msg = msgs[0]
    let type
    if (msg.charAt(0) === '{') {
      try {
        const parsed = JSON.parse(msg)
        if (parsed.pgn) {
          type = 'n2k-json'
        } else {
          type = 'signalk'
        }
        msgs = msgs.map(JSON.parse)
      } catch (ex) {
        console.error(ex)
        return {}
      }
    } else if (isN2KString) {
      // temporary until new canboatjs is released
      if (isN2KString(msg)) {
        type = 'n2k'
      } else if (msg.charAt(0) === '$' || msg.charAt(0) === '!') {
        type = '0183'
      } else {
        return {}
      }
    } else if (msg.charAt(0) === '$' || msg.charAt(0) === '!') {
      type = '0183'
    } else {
      type = 'n2k'
    }
    return { type, msgs }
  }

  app.post(`${serverRoutesPrefix}/inputTest`, (req, res) => {
    const sendToServer = req.body.sendToServer

    const { type, msgs } = detectType(req.body.value)

    if (!type) {
      res.status(400).send('unknown msg type')
      return
    }

    if (type === 'signalk') {
      if (sendToServer) {
        msgs.forEach(msg => {
          app.handleMessage('input-test', msg)
        })
      }
      res.json(msgs)
    } else {
      const { pipeElements, converter } = typeStreams[type](msgs)

      const converted = converter ? msgs.map(converter) : msgs

      if (pipeElements) {
        for (let i = pipeElements.length - 2; i >= 0; i--) {
          pipeElements[i].pipe(pipeElements[i + 1])
        }
        pipeElements[pipeElements.length - 1].on('data', msg => {
          if (sendToServer) {
            app.handleMessage('input-test', msg)
          }
          res.json(msg)
        })

        converted.forEach(msg => {
          pipeElements[0].write(msg)
        })
      } else {
        res.status(400).send(`unknown type ${type}`)
      }
    }
  })
}
