declare module 'stream-throttle' {
  import { Transform } from 'stream'
  export class Throttle extends Transform {
    constructor(options: { rate: number; chunksize?: number })
  }
}

declare module 'reconnect-core' {
  import { EventEmitter } from 'events'
  type ConnectFunction<T> = (options: object) => T
  interface Reconnector<T> extends EventEmitter {
    (options: object, callback?: (stream: T) => void): Reconnector<T>
    connect(options: object): Reconnector<T>
    disconnect(): void
    reconnect: boolean
  }
  function reconnect<T>(connect: ConnectFunction<T>): Reconnector<T>
  export = reconnect
}

declare module 'file-timestamp-stream' {
  import { Writable } from 'stream'
  interface FileTimestampStreamOptions {
    path: string
    flags?: string
  }
  class FileTimestampStream extends Writable {
    constructor(options: FileTimestampStreamOptions)
    currentFilename: string
    newFilename(): string
  }
  export = FileTimestampStream
}

declare module 'any-shell-escape' {
  function shellescape(args: string | string[]): string
  export = shellescape
}

declare module '@signalk/nmea0183-signalk' {
  class Parser {
    constructor(options?: object)
    parse(sentence: string): object | null
  }
  export = Parser
}

declare module '@signalk/nmea0183-utilities' {
  export function appendChecksum(sentence: string): string
}

declare module '@signalk/client' {
  import { EventEmitter } from 'events'
  interface ClientOptions {
    hostname: string
    port: number
    useTLS?: boolean
    reconnect?: boolean
    notifications?: boolean
    autoConnect?: boolean
    deltaStreamBehaviour?: string
    rejectUnauthorized?: boolean
    wsKeepaliveInterval?: number
  }
  class Client extends EventEmitter {
    options: ClientOptions
    constructor(options: ClientOptions)
    connect(): Promise<void>
    subscribe(subscription: object, id: string): void
    API(): Promise<{ get(path: string): Promise<string> }>
  }
  export { Client }
}

declare module 'aws-sdk' {
  interface S3ListObjectsParams {
    Bucket: string
    Prefix: string
  }
  interface S3Object {
    Key: string
  }
  interface S3ListObjectsResult {
    Contents: S3Object[]
  }
  interface S3GetObjectParams {
    Bucket: string
    Key: string
  }
  interface S3Request {
    on(event: string, handler: (err: Error) => void): void
    createReadStream(): import('stream').Readable
  }
  class S3 {
    listObjects(params: S3ListObjectsParams): {
      promise(): Promise<S3ListObjectsResult>
    }
    getObject(params: S3GetObjectParams): S3Request
  }
  export { S3 }
}

declare module 'node-gpsd-client' {
  import { EventEmitter } from 'events'
  interface GpsdOptions {
    port?: number
    hostname?: string
    logger?: {
      info: (...args: unknown[]) => void
      warn: (...args: unknown[]) => void
      error: (...args: unknown[]) => void
    }
    reconnectInterval?: number
    reconnectThreshold?: number
    parse: boolean
  }
  class Gpsd extends EventEmitter {
    constructor(options: GpsdOptions)
    connect(): void
    disconnect(): void
    watch(options?: object): void
  }
  export default Gpsd
}
