import type { PathMetadataEntry } from './types'

// The status of a server connection (provider): its delta and write rates,
// and the status of the gateway it reads the bus through, as NMEA 2000
// gateways report it in PGN 262400.
export const providersMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/providers': {
    description:
      'Status of the connections the server reads data through, by provider id'
  },
  '/vessels/*/providers/RegExp': {
    description: 'One connection, named by its provider id in the server'
  },
  '/vessels/*/providers/RegExp/deltaRate': {
    description:
      'Deltas the connection delivers per second. The server writes it unless the connection writes it itself, at least every 15 s',
    units: 'Hz'
  },
  '/vessels/*/providers/RegExp/writeRate': {
    description:
      'Messages written to the connection per second. The server writes it unless the connection writes it itself, at least every 15 s',
    units: 'Hz'
  },
  '/vessels/*/providers/RegExp/canNetworkLoad': {
    description: 'Load of the NMEA 2000 bus the gateway is connected to',
    units: 'ratio'
  },
  '/vessels/*/providers/RegExp/errors': {
    description: 'Number of bus errors the gateway has counted'
  },
  '/vessels/*/providers/RegExp/deviceCount': {
    description: 'Number of devices the gateway sees on the bus'
  },
  '/vessels/*/providers/RegExp/uptime': {
    description: 'Time since the gateway started',
    units: 's'
  },
  '/vessels/*/providers/RegExp/gatewayAddress': {
    description: 'NMEA 2000 source address of the gateway'
  },
  '/vessels/*/providers/RegExp/rejectedTxRequests': {
    description: 'Number of frames the gateway was asked to send but refused'
  }
}
