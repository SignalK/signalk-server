import { expect } from 'chai'
import { validateProviderConfig } from './validation'

describe('validateProviderConfig', () => {
  it('rejects provider types that require a source subtype', () => {
    expect(validateProviderConfig('NMEA2000', {}).valid).to.equal(false)
    expect(validateProviderConfig('SignalK', { type: 'none' }).valid).to.equal(
      false
    )
    expect(validateProviderConfig('NMEA2000', {}).message).to.equal(
      'Please select a source type'
    )
  })

  it('rejects missing device', () => {
    const result = validateProviderConfig('NMEA2000', {
      type: 'ngt-1-canboatjs'
    })
    expect(result).to.deep.equal({
      valid: false,
      message: 'Device is required'
    })
  })

  it('accepts valid device', () => {
    const result = validateProviderConfig('NMEA0183', {
      type: 'serial',
      device: '/dev/ttyUSB0'
    })
    expect(result.valid).to.equal(true)
  })

  it('rejects missing host', () => {
    const result = validateProviderConfig('NMEA2000', {
      type: 'ydwg02-canboatjs',
      port: 1457
    })
    expect(result).to.deep.equal({ valid: false, message: 'Host is required' })
  })

  it('accepts valid host and port', () => {
    const result = validateProviderConfig('SignalK', {
      type: 'ws',
      host: 'localhost',
      port: 3000
    })
    expect(result.valid).to.equal(true)
  })

  it('rejects missing port (port-only schema)', () => {
    const result = validateProviderConfig('NMEA0183', { type: 'udp' })
    expect(result).to.deep.equal({ valid: false, message: 'Port is required' })
  })

  it('rejects missing interface', () => {
    const result = validateProviderConfig('NMEA2000', { type: 'canbus' })
    expect(result).to.deep.equal({
      valid: false,
      message: 'Interface is required'
    })
  })

  it('rejects missing FileStream fields', () => {
    expect(
      validateProviderConfig('FileStream', { type: 'x', filename: 'f.log' })
        .message
    ).to.equal('Data Type is required')
    expect(
      validateProviderConfig('FileStream', { type: 'x', dataType: 'NMEA0183' })
        .message
    ).to.equal('File Name is required')
  })

  it('accepts valid FileStream', () => {
    const result = validateProviderConfig('FileStream', {
      type: 'x',
      dataType: 'NMEA0183',
      filename: '/var/log/data.log'
    })
    expect(result.valid).to.equal(true)
  })

  it('passes unknown types through as valid', () => {
    expect(
      validateProviderConfig('Execute', { type: 'command' }).valid
    ).to.equal(true)
  })

  it('passes subtypes with no required fields', () => {
    expect(
      validateProviderConfig('NMEA0183', { type: 'tcpserver' }).valid
    ).to.equal(true)
  })

  it('rejects empty string values', () => {
    const result = validateProviderConfig('NMEA2000', {
      type: 'ngt-1-canboatjs',
      device: ''
    })
    expect(result.valid).to.equal(false)
  })

  it('accepts port as string', () => {
    const result = validateProviderConfig('NMEA0183', {
      type: 'udp',
      port: '10110'
    })
    expect(result.valid).to.equal(true)
  })
})
