import { expect } from 'chai'
import {
  associatePluginWithRecentAddress,
  canbusPreferredAddress,
  isLocalN2kDeviceRunning,
  parseNmea2000OutAvailablePayload,
  rebindLocalDevicesByUniqueNumber,
  recordLocalN2kDevice,
  type LocalN2kDevice
} from '../src/n2k-local-devices'

describe('n2k-local-devices', function () {
  describe('parseNmea2000OutAvailablePayload', function () {
    it('returns empty for missing or non-object args', function () {
      expect(parseNmea2000OutAvailablePayload(undefined)).to.deep.equal({})
      expect(parseNmea2000OutAvailablePayload('nope')).to.deep.equal({})
      expect(parseNmea2000OutAvailablePayload([])).to.deep.equal({})
    })

    it('reads src, uniqueNumber and pluginId', function () {
      expect(
        parseNmea2000OutAvailablePayload({
          src: 37,
          uniqueNumber: 1060571,
          pluginId: 'signalk-naviop-plugin'
        })
      ).to.deep.equal({
        src: 37,
        uniqueNumber: 1060571,
        pluginId: 'signalk-naviop-plugin'
      })
    })
  })

  describe('recordLocalN2kDevice', function () {
    it('ignores payloads without a bus address', function () {
      const devices = new Map<number, LocalN2kDevice>()
      expect(
        recordLocalN2kDevice(devices, { pluginId: 'signalk-naviop-plugin' })
      ).to.equal(undefined)
      expect(devices.size).to.equal(0)
    })

    it('stores src and merges later pluginId on the same address', function () {
      const devices = new Map<number, LocalN2kDevice>()
      recordLocalN2kDevice(devices, { src: 37, uniqueNumber: 1060571 })
      recordLocalN2kDevice(devices, {
        src: 37,
        pluginId: 'signalk-naviop-plugin'
      })
      expect(devices.get(37)).to.deep.equal({
        src: 37,
        uniqueNumber: 1060571,
        pluginId: 'signalk-naviop-plugin'
      })
    })

    it('keeps one address per plugin when the claim moves', function () {
      const devices = new Map<number, LocalN2kDevice>()
      recordLocalN2kDevice(devices, {
        src: 21,
        uniqueNumber: 1731561,
        pluginId: 'signalk-bandg-performance-plugin'
      })
      recordLocalN2kDevice(devices, {
        src: 166,
        uniqueNumber: 1731561,
        pluginId: 'signalk-bandg-performance-plugin'
      })
      expect(devices.has(21)).to.equal(false)
      expect(devices.get(166)).to.deep.equal({
        src: 166,
        uniqueNumber: 1731561,
        pluginId: 'signalk-bandg-performance-plugin'
      })
    })
  })

  describe('rebindLocalDevicesByUniqueNumber', function () {
    it('moves a plugin mapping to the src that owns that uniqueNumber', function () {
      const devices = new Map<number, LocalN2kDevice>([
        [
          21,
          {
            src: 21,
            uniqueNumber: 1731561,
            pluginId: 'signalk-bandg-performance-plugin'
          }
        ]
      ])
      rebindLocalDevicesByUniqueNumber(
        devices,
        new Map<number, number>([[1731561, 166]])
      )
      expect(devices.has(21)).to.equal(false)
      expect(devices.get(166)?.pluginId).to.equal(
        'signalk-bandg-performance-plugin'
      )
    })
  })

  describe('associatePluginWithRecentAddress', function () {
    it('binds pluginId to the newest non-local address', function () {
      const devices = new Map<number, LocalN2kDevice>([[30, { src: 30 }]])
      const lastSeen = new Map<number, number>([
        [30, 1_000],
        [37, 5_000],
        [115, 4_000]
      ])
      const bound = associatePluginWithRecentAddress(
        devices,
        'signalk-naviop-plugin',
        lastSeen,
        5_500,
        15_000
      )
      expect(bound).to.deep.equal({
        src: 37,
        pluginId: 'signalk-naviop-plugin'
      })
      expect(devices.get(37)?.pluginId).to.equal('signalk-naviop-plugin')
    })

    it('ignores addresses outside the claim window', function () {
      const devices = new Map<number, LocalN2kDevice>()
      const lastSeen = new Map<number, number>([[37, 1_000]])
      expect(
        associatePluginWithRecentAddress(
          devices,
          'signalk-naviop-plugin',
          lastSeen,
          20_000,
          15_000
        )
      ).to.equal(undefined)
    })

    it('does not bind a second address for the same plugin', function () {
      const devices = new Map<number, LocalN2kDevice>([
        [37, { src: 37, pluginId: 'signalk-naviop-plugin' }]
      ])
      const lastSeen = new Map<number, number>([
        [37, 5_000],
        [22, 6_000]
      ])
      const bound = associatePluginWithRecentAddress(
        devices,
        'signalk-naviop-plugin',
        lastSeen,
        6_500,
        15_000
      )
      expect(bound?.src).to.equal(37)
      expect(devices.has(22)).to.equal(false)
    })

    it('skips the canbus preferred address', function () {
      const devices = new Map<number, LocalN2kDevice>()
      const lastSeen = new Map<number, number>([
        [30, 6_000],
        [37, 5_000]
      ])
      const bound = associatePluginWithRecentAddress(
        devices,
        'signalk-naviop-plugin',
        lastSeen,
        6_500,
        15_000,
        [30]
      )
      expect(bound?.src).to.equal(37)
      expect(devices.has(30)).to.equal(false)
    })
  })

  describe('canbusPreferredAddress', function () {
    it('returns the enabled canbus preferredAddress', function () {
      expect(
        canbusPreferredAddress([
          {
            enabled: true,
            pipeElements: [
              { type: 'providers/simple' },
              {
                type: 'providers/canbus',
                options: { preferredAddress: 30 }
              }
            ]
          }
        ])
      ).to.equal(30)
    })
  })

  describe('isLocalN2kDeviceRunning', function () {
    it('keeps the canbus identity running without a pluginId', function () {
      expect(isLocalN2kDeviceRunning({ src: 30 }, {})).to.equal(true)
    })

    it('treats a Stopped plugin as not running', function () {
      expect(
        isLocalN2kDeviceRunning(
          { src: 37, pluginId: 'signalk-naviop-plugin' },
          { 'signalk-naviop-plugin': { message: 'Stopped' } }
        )
      ).to.equal(false)
    })
  })
})
