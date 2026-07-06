import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../index'
import type { GnssSensorConfig } from '../types'
import type { GnssConfigPayload } from './gnssPositionSlice'

function row(sensorId: string, $source: string): GnssSensorConfig {
  return { sensorId, $source, fromBow: null, fromCenter: null }
}

function cfg(sensors: GnssSensorConfig[]): GnssConfigPayload {
  return { correction: 'off', sensors }
}

describe('gnssPositionSlice', () => {
  beforeEach(() => {
    useStore.setState({
      gnssSensorsData: {
        correction: 'off',
        sensors: [],
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      },
      positionSources: []
    })
  })

  describe('setGnssSensors', () => {
    it('applies server rows and resets dirty when there are no local edits', () => {
      const sensors = [row('gnss1', 'n2k.0.5')]

      useStore.getState().setGnssSensors(cfg(sensors))

      expect(useStore.getState().gnssSensorsData.sensors).toEqual(sensors)
      expect(useStore.getState().gnssSensorsData.saveState.dirty).toBe(false)
    })

    it('does not clobber unsaved local edits on a live server update', () => {
      useStore.getState().setGnssSensors(cfg([row('gnss1', 'n2k.0.5')]))
      useStore.getState().updateGnssSensor(0, { fromBow: 2 })

      useStore.getState().setGnssSensors(cfg([row('other', 'gp.GP')]))

      const data = useStore.getState().gnssSensorsData
      expect(data.sensors[0].sensorId).toBe('gnss1')
      expect(data.sensors[0].fromBow).toBe(2)
      expect(data.saveState.dirty).toBe(true)
    })

    it('overwrites unsaved local edits when forced', () => {
      useStore.getState().setGnssSensors(cfg([row('gnss1', 'n2k.0.5')]))
      useStore.getState().updateGnssSensor(0, { fromBow: 2 })

      useStore.getState().setGnssSensors(cfg([]), true)

      const data = useStore.getState().gnssSensorsData
      expect(data.sensors).toEqual([])
      expect(data.saveState.dirty).toBe(false)
    })
  })

  describe('setGnssCorrection', () => {
    it('sets the mode and marks dirty', () => {
      useStore.getState().setGnssCorrection('replace')

      const data = useStore.getState().gnssSensorsData
      expect(data.correction).toBe('replace')
      expect(data.saveState.dirty).toBe(true)
    })

    it('is a no-op when the mode is unchanged', () => {
      useStore.getState().setGnssCorrection('off')

      expect(useStore.getState().gnssSensorsData.saveState.dirty).toBe(false)
    })

    it('applies a server-sent mode via setGnssSensors', () => {
      useStore.getState().setGnssSensors({ correction: 'both', sensors: [] })

      const data = useStore.getState().gnssSensorsData
      expect(data.correction).toBe('both')
      expect(data.saveState.dirty).toBe(false)
    })
  })

  describe('updateGnssSensor', () => {
    beforeEach(() => {
      useStore
        .getState()
        .setGnssSensors(cfg([row('gnss1', 'n2k.0.5'), row('gnss2', 'gp.GP')]))
    })

    it('applies a valid edit, marks dirty and returns true', () => {
      const applied = useStore.getState().updateGnssSensor(0, { fromBow: 3.5 })

      expect(applied).toBe(true)
      const data = useStore.getState().gnssSensorsData
      expect(data.sensors[0].fromBow).toBe(3.5)
      expect(data.saveState.dirty).toBe(true)
    })

    it('rejects a duplicate sensorId and returns false', () => {
      const applied = useStore
        .getState()
        .updateGnssSensor(1, { sensorId: 'gnss1' })

      expect(applied).toBe(false)
      expect(useStore.getState().gnssSensorsData.sensors[1].sensorId).toBe(
        'gnss2'
      )
    })

    it('rejects a duplicate $source and returns false', () => {
      const applied = useStore
        .getState()
        .updateGnssSensor(1, { $source: 'n2k.0.5' })

      expect(applied).toBe(false)
      expect(useStore.getState().gnssSensorsData.sensors[1].$source).toBe(
        'gp.GP'
      )
    })

    it('rejects an out-of-range index and returns false', () => {
      expect(useStore.getState().updateGnssSensor(-1, { fromBow: 1 })).toBe(
        false
      )
      expect(useStore.getState().updateGnssSensor(2, { fromBow: 1 })).toBe(
        false
      )
    })
  })

  describe('addGnssSensor', () => {
    it('generates the next free gnss<n> id', () => {
      useStore.getState().addGnssSensor('n2k.0.5')
      useStore.getState().addGnssSensor('gp.GP')

      const sensors = useStore.getState().gnssSensorsData.sensors
      expect(sensors.map((s) => s.sensorId)).toEqual(['gnss1', 'gnss2'])
    })

    it('rejects a duplicate $source', () => {
      useStore.getState().addGnssSensor('n2k.0.5')
      useStore.getState().addGnssSensor('n2k.0.5')

      expect(useStore.getState().gnssSensorsData.sensors).toHaveLength(1)
    })
  })

  describe('save lifecycle', () => {
    it('setGnssSaving marks in-flight and clears a previous failure', () => {
      useStore.getState().setGnssSaveFailed('boom')

      useStore.getState().setGnssSaving()

      const data = useStore.getState().gnssSensorsData
      expect(data.saveState.isSaving).toBe(true)
      expect(data.saveState.saveFailed).toBe(false)
      expect(data.saveError).toBeUndefined()
    })

    it('setGnssSaved clears dirty, in-flight and error state', () => {
      useStore.getState().setGnssCorrection('replace')
      useStore.getState().setGnssSaving()

      useStore.getState().setGnssSaved()

      const data = useStore.getState().gnssSensorsData
      expect(data.saveState.dirty).toBe(false)
      expect(data.saveState.isSaving).toBe(false)
      expect(data.saveState.saveFailed).toBe(false)
      expect(data.saveError).toBeUndefined()
    })

    it('setGnssSaveFailed records the message and stops in-flight', () => {
      useStore.getState().setGnssSaving()

      useStore.getState().setGnssSaveFailed('duplicate id')

      const data = useStore.getState().gnssSensorsData
      expect(data.saveState.isSaving).toBe(false)
      expect(data.saveState.saveFailed).toBe(true)
      expect(data.saveError).toBe('duplicate id')
    })

    it('clearGnssSaveFailed resets the failure without touching dirty', () => {
      useStore.getState().setGnssCorrection('replace')
      useStore.getState().setGnssSaveFailed('duplicate id')

      useStore.getState().clearGnssSaveFailed()

      const data = useStore.getState().gnssSensorsData
      expect(data.saveState.saveFailed).toBe(false)
      expect(data.saveError).toBeUndefined()
      expect(data.saveState.dirty).toBe(true)
    })
  })

  describe('removeGnssSensor', () => {
    it('removes exactly the indexed row and marks dirty', () => {
      useStore
        .getState()
        .setGnssSensors(cfg([row('gnss1', 'n2k.0.5'), row('gnss2', 'gp.GP')]))

      useStore.getState().removeGnssSensor(0)

      const data = useStore.getState().gnssSensorsData
      expect(data.sensors.map((s) => s.sensorId)).toEqual(['gnss2'])
      expect(data.saveState.dirty).toBe(true)
    })

    it('ignores an out-of-range index', () => {
      useStore.getState().setGnssSensors(cfg([row('gnss1', 'n2k.0.5')]))

      useStore.getState().removeGnssSensor(5)

      expect(useStore.getState().gnssSensorsData.sensors).toHaveLength(1)
    })
  })
})
