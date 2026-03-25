import moment from 'moment'
import { Transform, TransformCallback } from 'stream'

interface TimestampMessage {
  timestamp: string
}

type GetMilliseconds = (msg: TimestampMessage) => number

interface TimestampThrottleOptions {
  getMilliseconds?: GetMilliseconds
}

function defaultGetMilliseconds(msg: TimestampMessage): number {
  // 2014-08-15-16:00:00.083
  return moment(msg.timestamp, 'YYYY-MM-DD-HH:mm:ss.SSS').valueOf()
}

export default class TimestampThrottle extends Transform {
  private lastMsgMillis: number
  private offsetMillis = 0
  private readonly getMilliseconds: GetMilliseconds

  constructor(options: TimestampThrottleOptions = {}) {
    super({ objectMode: true })
    this.lastMsgMillis = Date.now()
    this.getMilliseconds = options.getMilliseconds ?? defaultGetMilliseconds
  }

  _transform(
    msg: TimestampMessage,
    encoding: BufferEncoding,
    done: TransformCallback
  ): void {
    const msgMillis = this.getMilliseconds(msg)
    if (msgMillis < this.lastMsgMillis) {
      this.offsetMillis = Date.now() - msgMillis
    }
    this.lastMsgMillis = msgMillis
    const millisToCorrectSendTime = msgMillis - Date.now() + this.offsetMillis
    if (millisToCorrectSendTime <= 0) {
      this.push(msg)
      done()
    } else {
      const doPush = this.push.bind(this, msg)
      setTimeout(() => {
        doPush()
        done()
      }, millisToCorrectSendTime)
    }
  }
}
