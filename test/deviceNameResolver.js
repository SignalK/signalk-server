const chai = require('chai')
chai.Should()
const { resolveDeviceName } = require('../src/deviceNameResolver')

describe('Device Name Resolution', () => {
  it('returns device description as first priority', () => {
    const devices = [
      { clientId: 'test-client', description: 'Test Device Description' }
    ]
    const clientInfo = {
      skPrincipal: { name: 'Test User' },
      userAgent: 'Mozilla/5.0'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('Test Device Description')
  })
  
  it('returns principal name as second priority', () => {
    const devices = []
    const clientInfo = {
      skPrincipal: { name: 'Test User' },
      userAgent: 'Mozilla/5.0'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('Test User')
  })
  
  it('returns parsed user agent as third priority', () => {
    const devices = []
    const clientInfo = {
      userAgent: 'SensESP/2.0'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('SensESP Device')
  })
  
  it('correctly identifies OpenCPN', () => {
    const devices = []
    const clientInfo = {
      userAgent: 'OpenCPN/5.6.2'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('OpenCPN')
  })
  
  it('correctly identifies SignalK clients', () => {
    const devices = []
    const clientInfo = {
      userAgent: 'SignalK/1.0'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('SignalK Client')
  })
  
  it('correctly identifies web browsers', () => {
    const devices = []
    const clientInfo = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('Web Browser')
  })
  
  it('extracts first part of unknown user agents', () => {
    const devices = []
    const clientInfo = {
      userAgent: 'ESP32-Device/1.0 (Custom Firmware)'
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('ESP32-Device')
  })
  
  it('returns client ID as fallback', () => {
    const devices = []
    const clientInfo = {}
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('test-client')
  })
  
  it('handles missing clientInfo gracefully', () => {
    const devices = []
    
    const result = resolveDeviceName('test-client', devices)
    result.should.equal('test-client')
  })
  
  it('handles empty user agent gracefully', () => {
    const devices = []
    const clientInfo = {
      userAgent: ''
    }
    
    const result = resolveDeviceName('test-client', devices, clientInfo)
    result.should.equal('test-client')
  })
})