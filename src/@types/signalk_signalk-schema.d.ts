declare module '@signalk/signalk-schema' {
    import { EventEmitter } from 'events'

    export function getSourceId(source: any): string
    export class FullSignalK extends EventEmitter {
        constructor(selfId: string, selfType: string, defaults?: any)
        addDelta: (_: any) => void
        retrieve: () => any
    }
}