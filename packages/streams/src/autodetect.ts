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

import { Writable, Transform, TransformCallback } from 'stream'
import TimestampThrottle from './timestamp-throttle'
import N2KJsonToSignalK from './n2k-signalk'
import ActisenseSerialToJSON from './n2kAnalyzer'
import CanboatJs from './canboatjs'
import Nmea0183ToSignalK from './nmea0183-signalk'
import { StreamsApp } from './types'

/*

Provider to handle any kind of supported input data.

It will detect if the incoming data is in the 'multiplexedlog' format
(produced by the server's logging function)and if not, then it will
look at each incoming line to try to determine the type of data.

A multiplexed log should have this format:

milliseconds;discriminator;data
where discriminator can be
N => NMEA0183
I => Signal K delta
A => actisense-serial format N2K data

1471172400151;N;!AIVDM,1,1,,A,13KdO60034Qk?WtRHUJQ3@ol05Cd,0*55
1471172400152;I;{"updates":[{"source":{"label":"i2c"},"values":[{"path":"electrical.batteries.house.voltage","value":13.5741469711775},{"path":"electrical.batteries.house.current","value":0.39957033121875}],"timestamp":"2016-07-16T12:00:08.825Z"}],"context":"vessels.230029970"}
1471172400153;A;2016-07-16T12:00:00.000Z,2,130306,105,255,8,00,d1,03,c9,23,fa,ff,ff
*/

interface AutodetectOptions {
  app: StreamsApp
  providerId: string
  noThrottle?: boolean
  useCanboatjs?: boolean
  [key: string]: unknown
}

interface TimestampedMessage {
  timestamp: number | string
  discriminator: string
  data: string
  fromFile?: boolean
}

interface DeltaMessage {
  updates?: Array<{ timestamp?: Date; [key: string]: unknown }>
  [key: string]: unknown
}

class ToTimestamped extends Transform {
  private readonly deMultiplexer: DeMultiplexer
  private readonly options: AutodetectOptions
  private multiplexedFormat = false

  constructor(deMultiplexer: DeMultiplexer, options: AutodetectOptions) {
    super({ objectMode: true })
    this.deMultiplexer = deMultiplexer
    this.options = options
  }

  _transform(
    msg: string | Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    const str = msg.toString()
    if (str.trim().length === 0) {
      done()
      return
    }

    this.multiplexedFormat =
      str.length > 16 && str.charAt(13) === ';' && str.split(';').length >= 3
    if (this.multiplexedFormat) {
      if (this.options.noThrottle) {
        this.deMultiplexer.toTimestamped.pipe(this.deMultiplexer.splitter)
      } else {
        this.deMultiplexer.toTimestamped
          .pipe(this.deMultiplexer.timestampThrottle)
          .pipe(this.deMultiplexer.splitter)
      }
      this._transform = this.handleMultiplexed
    } else {
      this._transform = this.handleMixed
    }
    this._transform(msg, encoding, done)
  }

  private handleMixed(
    msg: string | Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    const line = msg.toString()
    const res: TimestampedMessage = {
      timestamp: new Date().getTime(),
      data: line,
      discriminator: 'I'
    }
    if (line.charAt(0) === '{') {
      res.discriminator = 'I'
    } else if (
      (line.charAt(0) === '$' || line.charAt(0) === '!') &&
      !line.startsWith('!PDGY')
    ) {
      res.discriminator = 'N'
    } else {
      res.discriminator = 'A'
    }
    this.push(res)
    done()
  }

  private handleMultiplexed(
    msg: string | Buffer,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    const line = msg.toString()
    const parts = line.split(';')
    this.push({
      timestamp: parts[0],
      discriminator: parts[1],
      data: parts.slice(2).join(';')
    })
    done()
  }
}

class Splitter extends Transform {
  private readonly demuxEmitData: (msg: object) => void
  private readonly fromN2KJson: N2KJsonToSignalK
  private readonly fromActisenseSerial: CanboatJs | ActisenseSerialToJSON
  private readonly fromNMEA0183: Nmea0183ToSignalK

  constructor(deMultiplexer: DeMultiplexer, options: AutodetectOptions) {
    super({ objectMode: true })
    this.demuxEmitData = (msg: object) => {
      deMultiplexer.emit('data', msg)
    }

    this.fromN2KJson = new N2KJsonToSignalK(options)
    this.fromN2KJson.on('data', this.demuxEmitData)

    if (options.useCanboatjs === undefined || options.useCanboatjs) {
      this.fromActisenseSerial = new CanboatJs(options)
    } else {
      this.fromActisenseSerial = new ActisenseSerialToJSON(options)
    }
    this.fromActisenseSerial.pipe(this.fromN2KJson)

    this.fromNMEA0183 = new Nmea0183ToSignalK(options)
    this.fromNMEA0183.on('data', this.demuxEmitData)
  }

  _transform(
    msg: TimestampedMessage,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    let actualDone = done
    try {
      switch (msg.discriminator) {
        case 'A': {
          msg.fromFile = true
          const result = this.fromActisenseSerial.write(msg, encoding)
          if (!result) {
            this.fromActisenseSerial.once('drain', done)
            actualDone = () => {}
          }
          break
        }
        case 'C':
        case 'N':
        case 'G':
        case 'M':
          this.fromNMEA0183.write(
            { line: msg.data, timestamp: msg.timestamp },
            encoding
          )
          break
        case 'I':
        default:
          try {
            const parsed = JSON.parse(msg.data) as DeltaMessage
            const timestamp = new Date(Number(msg.timestamp))
            if (parsed.updates) {
              parsed.updates.forEach((update) => {
                update.timestamp = timestamp
              })
            }
            this.push(parsed)
            this.demuxEmitData(parsed)
          } catch (e) {
            console.error(e)
          }
          break
      }
    } finally {
      actualDone()
    }
  }

  pipe<T extends NodeJS.WritableStream>(target: T): T {
    this.fromN2KJson.pipe(target as unknown as Writable)
    this.fromNMEA0183.pipe(target as unknown as Writable)
    return Transform.prototype.pipe.call(this, target) as T
  }
}

export default class DeMultiplexer extends Writable {
  readonly toTimestamped: ToTimestamped
  readonly timestampThrottle: TimestampThrottle
  readonly splitter: Splitter

  constructor(options: AutodetectOptions) {
    super()
    this.toTimestamped = new ToTimestamped(this, options)
    this.timestampThrottle = new TimestampThrottle({
      getMilliseconds: (msg) =>
        typeof msg.timestamp === 'string'
          ? Number(msg.timestamp)
          : msg.timestamp
    })
    this.splitter = new Splitter(this, options)

    this.toTimestamped.on('drain', this.emit.bind(this, 'drain'))
  }

  pipe<T extends NodeJS.WritableStream>(target: T): T {
    return this.splitter.pipe(target)
  }

  write(
    chunk: unknown,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ): boolean {
    if (typeof encodingOrCallback === 'function') {
      return this.toTimestamped.write(
        chunk as string | Buffer,
        encodingOrCallback
      )
    }
    return this.toTimestamped.write(
      chunk as string | Buffer,
      encodingOrCallback ?? 'utf8',
      callback
    )
  }
}
