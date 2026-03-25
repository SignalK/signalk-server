declare module 'primus' {
  import { Server } from 'http'

  interface PrimusOptions {
    pathname?: string
    transformer?: string
    parser?: string
    compression?: boolean
    transport?: Record<string, unknown>
    pingInterval?: boolean | number
    [key: string]: unknown
  }

  class Primus {
    constructor(server: Server, options?: PrimusOptions)
    authorize(
      fn: (req: unknown, authorized: (err?: Error) => void) => void
    ): void
    on(
      event: 'connection' | 'disconnection',
      handler: (spark: unknown) => void
    ): void
    once(event: string, handler: (...args: unknown[]) => void): void
    forEach(fn: (spark: unknown) => void): void
    destroy(
      options: { close: boolean; timeout: number; reconnect?: boolean },
      fn?: () => void
    ): void
  }

  export = Primus
}
