import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../index'
import type { PathData, MetaData } from './dataSlice'

describe('dataSlice', () => {
  beforeEach(() => {
    // Reset data state before each test
    useStore.getState().clearData()
  })

  describe('updatePath', () => {
    it('should add path data for a new context and path', () => {
      const pathData: PathData = {
        value: 12.5,
        timestamp: '2024-01-15T10:30:00Z',
        $source: 'nmea0183.0'
      }

      useStore
        .getState()
        .updatePath(
          'vessels.self',
          'navigation.speedOverGround$nmea0183.0',
          pathData
        )

      const data = useStore.getState().signalkData
      expect(
        data['vessels.self']['navigation.speedOverGround$nmea0183.0']
      ).toEqual(pathData)
    })

    it('should increment dataVersion when adding a new path', () => {
      const initialVersion = useStore.getState().dataVersion

      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.heading$nmea0183.0', {
          value: 1.57,
          timestamp: '2024-01-15T10:30:00Z'
        })

      expect(useStore.getState().dataVersion).toBe(initialVersion + 1)
    })

    it('should not increment dataVersion when updating existing path', () => {
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.heading$nmea0183.0', {
          value: 1.57,
          timestamp: '2024-01-15T10:30:00Z'
        })

      const versionAfterAdd = useStore.getState().dataVersion

      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.heading$nmea0183.0', {
          value: 1.58,
          timestamp: '2024-01-15T10:30:01Z'
        })

      expect(useStore.getState().dataVersion).toBe(versionAfterAdd)
    })

    it('should handle multiple contexts', () => {
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.speedOverGround$nmea0183.0', {
          value: 10.0
        })
      useStore
        .getState()
        .updatePath(
          'vessels.urn:mrn:imo:mmsi:123456789',
          'navigation.speedOverGround$ais',
          {
            value: 15.0
          }
        )

      const contexts = useStore.getState().getContexts()
      expect(contexts).toHaveLength(2)
      expect(contexts).toContain('vessels.self')
      expect(contexts).toContain('vessels.urn:mrn:imo:mmsi:123456789')
    })
  })

  describe('updateMeta', () => {
    it('should add metadata for a path', () => {
      const metaData: MetaData = {
        units: 'm/s',
        description: 'Speed over ground'
      }

      useStore
        .getState()
        .updateMeta('vessels.self', 'navigation.speedOverGround', metaData)

      const meta = useStore.getState().signalkMeta
      expect(meta['vessels.self']['navigation.speedOverGround']).toEqual(
        metaData
      )
    })

    it('should merge metadata with existing values', () => {
      useStore
        .getState()
        .updateMeta('vessels.self', 'navigation.speedOverGround', {
          units: 'm/s'
        })

      useStore
        .getState()
        .updateMeta('vessels.self', 'navigation.speedOverGround', {
          description: 'Speed over ground'
        })

      const meta = useStore
        .getState()
        .getMeta('vessels.self', 'navigation.speedOverGround')
      expect(meta?.units).toBe('m/s')
      expect(meta?.description).toBe('Speed over ground')
    })
  })

  describe('getPathData', () => {
    it('should return path data if it exists', () => {
      const pathData: PathData = {
        value: 25.5,
        timestamp: '2024-01-15T10:30:00Z'
      }

      useStore
        .getState()
        .updatePath(
          'vessels.self',
          'environment.wind.speedApparent$nmea0183.0',
          pathData
        )

      const result = useStore
        .getState()
        .getPathData(
          'vessels.self',
          'environment.wind.speedApparent$nmea0183.0'
        )
      expect(result).toEqual(pathData)
    })

    it('should return undefined for non-existent path', () => {
      const result = useStore
        .getState()
        .getPathData('vessels.self', 'non.existent.path')
      expect(result).toBeUndefined()
    })

    it('should return undefined for non-existent context', () => {
      const result = useStore
        .getState()
        .getPathData('non.existent.context', 'some.path')
      expect(result).toBeUndefined()
    })
  })

  describe('getMeta', () => {
    it('should return metadata if it exists', () => {
      useStore
        .getState()
        .updateMeta('vessels.self', 'navigation.speedOverGround', {
          units: 'm/s'
        })

      const result = useStore
        .getState()
        .getMeta('vessels.self', 'navigation.speedOverGround')
      expect(result?.units).toBe('m/s')
    })

    it('should return undefined for non-existent metadata', () => {
      const result = useStore
        .getState()
        .getMeta('vessels.self', 'non.existent.path')
      expect(result).toBeUndefined()
    })
  })

  describe('getPath$SourceKeys', () => {
    it('should return all path$source keys for a context', () => {
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.speedOverGround$nmea0183.0', {
          value: 10
        })
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.speedOverGround$n2k.1', {
          value: 10.1
        })
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.heading$nmea0183.0', {
          value: 1.5
        })

      const keys = useStore.getState().getPath$SourceKeys('vessels.self')
      expect(keys).toHaveLength(3)
      expect(keys).toContain('navigation.speedOverGround$nmea0183.0')
      expect(keys).toContain('navigation.speedOverGround$n2k.1')
      expect(keys).toContain('navigation.heading$nmea0183.0')
    })

    it('should return empty array for non-existent context', () => {
      const keys = useStore
        .getState()
        .getPath$SourceKeys('non.existent.context')
      expect(keys).toEqual([])
    })
  })

  describe('getContexts', () => {
    it('should return all contexts', () => {
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.speedOverGround$nmea0183.0', {
          value: 10
        })
      useStore
        .getState()
        .updatePath(
          'vessels.urn:mrn:imo:mmsi:111111111',
          'navigation.position$ais',
          { value: {} }
        )

      const contexts = useStore.getState().getContexts()
      expect(contexts).toHaveLength(2)
    })

    it('should return empty array when no data', () => {
      const contexts = useStore.getState().getContexts()
      expect(contexts).toEqual([])
    })
  })

  describe('clearData', () => {
    it('should clear all data and reset version', () => {
      useStore
        .getState()
        .updatePath('vessels.self', 'navigation.speedOverGround$nmea0183.0', {
          value: 10
        })
      useStore
        .getState()
        .updateMeta('vessels.self', 'navigation.speedOverGround', {
          units: 'm/s'
        })

      useStore.getState().clearData()

      expect(useStore.getState().signalkData).toEqual({})
      expect(useStore.getState().signalkMeta).toEqual({})
      expect(useStore.getState().dataVersion).toBe(0)
    })
  })
})
