/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@signalk/signalk-schema' {
  import { EventEmitter } from 'events'

  export function getSourceId(source: any): import('../types').SourceRef
  export class FullSignalK extends EventEmitter {
    constructor(selfId: string, selfType: string, defaults?: any)
    addDelta: (_: any) => void
    retrieve: () => any
    pruneContexts: () => void
  }
}
