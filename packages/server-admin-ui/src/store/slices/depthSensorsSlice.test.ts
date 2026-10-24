import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../index'
import type { DepthSensorConfig } from '../types'
import { EMPTY_DEPTH_CONFIG, sanitizeDepthConfig } from './depthSensorsSlice'

function row(sensorId: string, $source: string): DepthSensorConfig {
  return {
    sensorId,
    $source,
    fromBow: null,
    fromCenter: null,
    fromWaterline: null
  }
}

const data = () => useStore.getState().depthSensorsData

describe('depthSensorsSlice', () => {
  beforeEach(() => {
    useStore.setState({
      depthSensorsData: {
        sensors: [],
        saveState: { dirty: false, timeoutsOk: true }
      },
      depthSources: []
    })
  })

  it('adds a row for a detected source with the next free label', () => {
    useStore.getState().setDepthSensors({ sensors: [row('depth1', 'a.1')] })
    useStore.getState().addDepthSensor('b.2')

    expect(data().sensors[1]).toEqual(row('depth2', 'b.2'))
    expect(data().saveState.dirty).toBe(true)
  })

  it('does not add a second row for the same source', () => {
    useStore.getState().addDepthSensor('a.1')
    useStore.getState().addDepthSensor('a.1')

    expect(data().sensors).toHaveLength(1)
  })

  it('rejects a label another transducer already uses', () => {
    useStore
      .getState()
      .setDepthSensors({ sensors: [row('keel', 'a.1'), row('bow', 'b.2')] })

    expect(useStore.getState().updateDepthSensor(1, { sensorId: 'keel' })).toBe(
      false
    )
    expect(data().sensors[1].sensorId).toBe('bow')
  })

  it('keeps unsaved edits when the server sends its config', () => {
    useStore.getState().addDepthSensor('a.1')
    useStore.getState().updateDepthSensor(0, { fromWaterline: 0.7 })
    useStore.getState().setDepthSensors({ sensors: [] })

    expect(data().sensors[0].fromWaterline).toBe(0.7)

    useStore.getState().setDepthSensors(EMPTY_DEPTH_CONFIG, true)
    expect(data().sensors).toEqual([])
    expect(data().saveState.dirty).toBe(false)
  })

  it('falls back to no transducers for a malformed payload', () => {
    expect(sanitizeDepthConfig({ sensors: [{ sensorId: 'x' }] })).toBe(
      EMPTY_DEPTH_CONFIG
    )
    expect(sanitizeDepthConfig(undefined)).toBe(EMPTY_DEPTH_CONFIG)
    const valid = { sensors: [row('keel', 'a.1')] }
    expect(sanitizeDepthConfig(valid)).toEqual(valid)
  })
})
