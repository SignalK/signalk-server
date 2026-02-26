const requiredFields: Record<string, Record<string, string[]>> = {
  NMEA2000: {
    'ngt-1-canboatjs': ['device'],
    'ngt-1': ['device'],
    'ikonvert-canboatjs': ['device'],
    'ydwg02-usb-canboatjs': ['device'],
    'ydwg02-canboatjs': ['host', 'port'],
    'ydwg02-udp-canboatjs': ['host', 'port'],
    'navlink2-tcp-canboatjs': ['host', 'port'],
    'w2k-1-n2k-ascii-canboatjs': ['host', 'port'],
    'w2k-1-n2k-actisense-canboatjs': ['host', 'port'],
    'canbus-canboatjs': ['interface'],
    canbus: ['interface']
  },
  NMEA0183: {
    tcp: ['host', 'port'],
    udp: ['port'],
    serial: ['device'],
    gpsd: ['host', 'port'],
    tcpserver: []
  },
  SignalK: {
    ws: ['host', 'port'],
    wss: ['host', 'port'],
    tcp: ['host', 'port'],
    udp: ['port'],
    serial: ['device']
  },
  FileStream: {
    _any: ['dataType', 'filename']
  }
}

const SOURCE_REQUIRED_TYPES = ['NMEA2000', 'NMEA0183', 'SignalK', 'Seatalk']

const fieldLabels: Record<string, string> = {
  device: 'Device',
  host: 'Host',
  port: 'Port',
  interface: 'Interface',
  filename: 'File Name',
  dataType: 'Data Type'
}

export function validateProvider(provider: {
  type: string
  options: Record<string, unknown>
}): { valid: boolean; message: string } {
  const { type, options } = provider

  if (
    SOURCE_REQUIRED_TYPES.includes(type) &&
    (!options.type || options.type === 'none')
  ) {
    return { valid: false, message: 'Please select a source type' }
  }

  const typeRules = requiredFields[type]
  if (typeRules) {
    const fields = typeRules[options.type as string] ?? typeRules._any
    if (fields) {
      for (const field of fields) {
        const val = options[field]
        if (val === undefined || val === null || val.toString().trim() === '') {
          return {
            valid: false,
            message: `${fieldLabels[field] || field} is required`
          }
        }
      }
    }
  }

  return { valid: true, message: '' }
}
