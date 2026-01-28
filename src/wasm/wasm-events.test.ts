/* eslint-disable @typescript-eslint/no-unused-expressions */
/**
 * Unit tests for WasmEventManager
 */

import { expect } from 'chai'
import { WasmEventManager, ServerEvent } from './wasm-events'

describe('WasmEventManager', () => {
  let manager: WasmEventManager

  beforeEach(() => {
    manager = new WasmEventManager()
  })

  describe('isAllowed', () => {
    it('allows server events', () => {
      expect(manager.isAllowed('SERVERSTATISTICS')).to.be.true
      expect(manager.isAllowed('VESSEL_INFO')).to.be.true
      expect(manager.isAllowed('DEBUG_SETTINGS')).to.be.true
      expect(manager.isAllowed('SERVERMESSAGE')).to.be.true
      expect(manager.isAllowed('PROVIDERSTATUS')).to.be.true
      expect(manager.isAllowed('SOURCEPRIORITIES')).to.be.true
    })

    it('allows generic NMEA events', () => {
      expect(manager.isAllowed('nmea0183')).to.be.true
      expect(manager.isAllowed('nmea0183out')).to.be.true
      expect(manager.isAllowed('nmea2000JsonOut')).to.be.true
      expect(manager.isAllowed('nmea2000out')).to.be.true
      expect(manager.isAllowed('nmea2000OutAvailable')).to.be.true
    })

    it('allows canboatjs events', () => {
      expect(manager.isAllowed('canboatjs:error')).to.be.true
      expect(manager.isAllowed('canboatjs:warning')).to.be.true
      expect(manager.isAllowed('canboatjs:unparsed:data')).to.be.true
    })

    it('allows PLUGIN_ prefixed events', () => {
      expect(manager.isAllowed('PLUGIN_CUSTOM')).to.be.true
      expect(manager.isAllowed('PLUGIN_MY_EVENT')).to.be.true
    })

    it('rejects unknown event types', () => {
      expect(manager.isAllowed('UNKNOWN')).to.be.false
      expect(manager.isAllowed('randomEvent')).to.be.false
    })
  })

  describe('isServerEvent / isGenericEvent', () => {
    it('correctly identifies server events', () => {
      expect(manager.isServerEvent('SERVERSTATISTICS')).to.be.true
      expect(manager.isServerEvent('VESSEL_INFO')).to.be.true
      expect(manager.isServerEvent('nmea0183')).to.be.false
      expect(manager.isServerEvent('nmea2000JsonOut')).to.be.false
    })

    it('correctly identifies generic events', () => {
      expect(manager.isGenericEvent('nmea0183')).to.be.true
      expect(manager.isGenericEvent('nmea0183out')).to.be.true
      expect(manager.isGenericEvent('nmea2000JsonOut')).to.be.true
      expect(manager.isGenericEvent('canboatjs:error')).to.be.true
      expect(manager.isGenericEvent('SERVERSTATISTICS')).to.be.false
      expect(manager.isGenericEvent('VESSEL_INFO')).to.be.false
    })
  })

  describe('getAllowedEventTypes', () => {
    it('returns all allowed event types', () => {
      const types = manager.getAllowedEventTypes()
      expect(types).to.include('SERVERSTATISTICS')
      expect(types).to.include('nmea0183')
      expect(types).to.include('nmea2000JsonOut')
    })
  })

  describe('getAllowedServerEvents', () => {
    it('returns only server events', () => {
      const types = manager.getAllowedServerEvents()
      expect(types).to.include('SERVERSTATISTICS')
      expect(types).to.include('VESSEL_INFO')
      expect(types).to.not.include('nmea0183')
      expect(types).to.not.include('nmea2000JsonOut')
    })
  })

  describe('getAllowedGenericEvents', () => {
    it('returns only generic events', () => {
      const types = manager.getAllowedGenericEvents()
      expect(types).to.include('nmea0183')
      expect(types).to.include('nmea2000JsonOut')
      expect(types).to.not.include('SERVERSTATISTICS')
      expect(types).to.not.include('VESSEL_INFO')
    })
  })

  describe('routeEvent', () => {
    it('routes events to subscribed plugins', () => {
      const received: ServerEvent[] = []
      manager.register('test-plugin', ['nmea0183'], (event) => {
        received.push(event)
      })

      const event: ServerEvent = {
        type: 'nmea0183',
        data: '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A',
        timestamp: Date.now()
      }

      manager.routeEvent(event)

      expect(received).to.have.length(1)
      expect(received[0].type).to.equal('nmea0183')
    })

    it('does not route disallowed events', () => {
      const received: ServerEvent[] = []
      manager.register('test-plugin', [], (event) => {
        received.push(event)
      })

      const event: ServerEvent = {
        type: 'UNKNOWN_EVENT',
        data: {},
        timestamp: Date.now()
      }

      manager.routeEvent(event)

      expect(received).to.have.length(0)
    })
  })
})
