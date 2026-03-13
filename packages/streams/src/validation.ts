import { type TObject, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'

export interface ValidationResult {
  valid: boolean
  message: string
}

const RequiredHostPort = Type.Object({
  host: Type.String({ minLength: 1 }),
  port: Type.Union([Type.Number({ minimum: 1 }), Type.String({ minLength: 1 })])
})

const RequiredPort = Type.Object({
  port: Type.Union([Type.Number({ minimum: 1 }), Type.String({ minLength: 1 })])
})

const RequiredDevice = Type.Object({
  device: Type.String({ minLength: 1 })
})

const RequiredInterface = Type.Object({
  interface: Type.String({ minLength: 1 })
})

const RequiredFileStream = Type.Object({
  dataType: Type.String({ minLength: 1 }),
  filename: Type.String({ minLength: 1 })
})

const schemasByType: Record<string, Record<string, TObject>> = {
  NMEA2000: {
    'ngt-1-canboatjs': RequiredDevice,
    'ngt-1': RequiredDevice,
    'ikonvert-canboatjs': RequiredDevice,
    'ydwg02-usb-canboatjs': RequiredDevice,
    'ydwg02-canboatjs': RequiredHostPort,
    'ydwg02-udp-canboatjs': RequiredHostPort,
    'navlink2-tcp-canboatjs': RequiredHostPort,
    'w2k-1-n2k-ascii-canboatjs': RequiredHostPort,
    'w2k-1-n2k-actisense-canboatjs': RequiredHostPort,
    'canbus-canboatjs': RequiredInterface,
    canbus: RequiredInterface
  },
  NMEA0183: {
    tcp: RequiredHostPort,
    udp: RequiredPort,
    serial: RequiredDevice,
    gpsd: RequiredHostPort
  },
  SignalK: {
    ws: RequiredHostPort,
    wss: RequiredHostPort,
    tcp: RequiredHostPort,
    udp: RequiredPort,
    serial: RequiredDevice
  },
  FileStream: {
    _any: RequiredFileStream
  }
}

const fieldLabels: Record<string, string> = {
  device: 'Device',
  host: 'Host',
  port: 'Port',
  interface: 'Interface',
  filename: 'File Name',
  dataType: 'Data Type'
}

const SOURCE_REQUIRED_TYPES = ['NMEA2000', 'NMEA0183', 'SignalK', 'Seatalk']

export function validateProviderConfig(
  type: string,
  options: Record<string, unknown>
): ValidationResult {
  if (
    SOURCE_REQUIRED_TYPES.includes(type) &&
    (!options.type || options.type === 'none')
  ) {
    return { valid: false, message: 'Please select a source type' }
  }

  const typeRules = schemasByType[type]
  if (!typeRules) {
    return { valid: true, message: '' }
  }

  const schema = typeRules[options.type as string] ?? typeRules._any
  if (!schema) {
    return { valid: true, message: '' }
  }

  if (!Value.Check(schema, options)) {
    const firstError = Value.Errors(schema, options).First()
    if (firstError) {
      const field = firstError.path.replace(/^\//, '')
      return {
        valid: false,
        message: `${fieldLabels[field] ?? field} is required`
      }
    }
  }

  return { valid: true, message: '' }
}
