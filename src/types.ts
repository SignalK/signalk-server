import { EventEmitter } from 'events'

export interface HelloMessage {
  name: string
  version: string
  self: string
  roles: string[]
  timestamp: Date
}

export interface SignalKServer {
  handleMessage: (providerId: string, message: any) => void
  getHello: () => HelloMessage
  signalk: EventEmitter
}

export class Interface {
  start?: () => void
  stop?: () => void
  mdns?: MdnsAdvertisement
}

export interface MdnsAdvertisement {
  name: string
  type: string
  port: number
}
