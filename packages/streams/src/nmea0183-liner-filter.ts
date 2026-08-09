import { Transform, TransformCallback } from 'stream'

// Runs after Liner in the gpsd pipeline: gpsd emits its own JSON protocol
// messages (class VERSION, DEVICES, WATCH) on connect and after every
// reconnect, even with nmea:true/json:false in the WATCH command. Liner has
// already split the stream into individual lines, so this only needs to drop
// any line that is not an NMEA 0183 sentence ('$' talker or '!' AIS prefix).
export default class Nmea0183LinerFilter extends Transform {
  constructor() {
    super({ objectMode: true })
  }

  _transform(
    line: string,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    if (line.startsWith('$') || line.startsWith('!')) {
      this.push(line)
    }
    done()
  }
}
