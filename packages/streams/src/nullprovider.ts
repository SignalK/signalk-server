import { Transform } from 'stream'

export default class NullProvider extends Transform {
  constructor() {
    super({ objectMode: true })
  }
}
