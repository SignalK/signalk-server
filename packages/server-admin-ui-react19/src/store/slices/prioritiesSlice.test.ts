import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../index'

describe('prioritiesSlice', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useStore.setState({
      sourcePrioritiesData: {
        sourcePriorities: [],
        saveState: {
          dirty: false,
          timeoutsOk: true
        }
      }
    })
  })

  describe('initial state', () => {
    it('should have empty source priorities', () => {
      expect(useStore.getState().sourcePrioritiesData.sourcePriorities).toEqual(
        []
      )
    })

    it('should have dirty false', () => {
      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        false
      )
    })

    it('should have timeoutsOk true', () => {
      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(true)
    })
  })

  describe('setSourcePriorities', () => {
    it('should set source priorities from server format', () => {
      const serverData = {
        'navigation.speedOverGround': [
          { sourceRef: 'nmea0183.0', timeout: 5000 },
          { sourceRef: 'n2k.1', timeout: 10000 }
        ],
        'navigation.courseOverGroundTrue': [
          { sourceRef: 'nmea0183.0', timeout: 3000 }
        ]
      }

      useStore.getState().setSourcePriorities(serverData)

      const priorities =
        useStore.getState().sourcePrioritiesData.sourcePriorities
      expect(priorities).toHaveLength(2)
      expect(priorities[0].path).toBe('navigation.speedOverGround')
      expect(priorities[0].priorities).toHaveLength(2)
      expect(priorities[1].path).toBe('navigation.courseOverGroundTrue')
    })

    it('should reset save state when setting priorities', () => {
      // First make it dirty
      useStore.getState().changePath(0, 'test.path')
      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        true
      )

      // Then set from server
      useStore.getState().setSourcePriorities({})

      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        false
      )
      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(true)
    })
  })

  describe('changePath', () => {
    it('should add a new path when index equals length', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')

      const priorities =
        useStore.getState().sourcePrioritiesData.sourcePriorities
      expect(priorities).toHaveLength(1)
      expect(priorities[0].path).toBe('navigation.speedOverGround')
      expect(priorities[0].priorities).toEqual([])
    })

    it('should update an existing path', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePath(0, 'navigation.courseOverGroundTrue')

      const priorities =
        useStore.getState().sourcePrioritiesData.sourcePriorities
      expect(priorities).toHaveLength(1)
      expect(priorities[0].path).toBe('navigation.courseOverGroundTrue')
    })

    it('should mark state as dirty', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')

      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        true
      )
    })
  })

  describe('deletePath', () => {
    it('should delete a path at the given index', () => {
      useStore.getState().changePath(0, 'path1')
      useStore.getState().changePath(1, 'path2')
      useStore.getState().changePath(2, 'path3')

      useStore.getState().deletePath(1)

      const priorities =
        useStore.getState().sourcePrioritiesData.sourcePriorities
      expect(priorities).toHaveLength(2)
      expect(priorities[0].path).toBe('path1')
      expect(priorities[1].path).toBe('path3')
    })

    it('should mark state as dirty', () => {
      useStore.getState().changePath(0, 'path1')
      useStore.setState({
        sourcePrioritiesData: {
          ...useStore.getState().sourcePrioritiesData,
          saveState: { dirty: false, timeoutsOk: true }
        }
      })

      useStore.getState().deletePath(0)

      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        true
      )
    })
  })

  describe('changePriority', () => {
    it('should add a new priority to a path', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)

      const prios =
        useStore.getState().sourcePrioritiesData.sourcePriorities[0].priorities
      expect(prios).toHaveLength(1)
      expect(prios[0].sourceRef).toBe('nmea0183.0')
      expect(prios[0].timeout).toBe(5000)
    })

    it('should update an existing priority', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 0, 'n2k.1', 10000)

      const prios =
        useStore.getState().sourcePrioritiesData.sourcePriorities[0].priorities
      expect(prios).toHaveLength(1)
      expect(prios[0].sourceRef).toBe('n2k.1')
      expect(prios[0].timeout).toBe(10000)
    })

    it('should create path if it does not exist', () => {
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)

      const priorities =
        useStore.getState().sourcePrioritiesData.sourcePriorities
      expect(priorities).toHaveLength(1)
      expect(priorities[0].path).toBe('')
      expect(priorities[0].priorities[0].sourceRef).toBe('nmea0183.0')
    })

    it('should mark state as dirty', () => {
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)

      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        true
      )
    })

    it('should validate timeouts - first priority can have any timeout', () => {
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)

      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(true)
    })

    it('should validate timeouts - subsequent must be increasing', () => {
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)

      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(true)
    })

    it('should fail timeout validation when third is not greater than second', () => {
      // Note: The checkTimeouts function only validates that timeouts are increasing
      // starting from the 3rd element (index 2). First two just need to be valid numbers.
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)
      useStore.getState().changePriority(0, 2, 'ais', 8000) // Less than second

      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(false)
    })

    it('should fail timeout validation for invalid timeout values', () => {
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 0) // Zero is invalid

      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(false)
    })
  })

  describe('deletePriority', () => {
    it('should delete a priority at the given index', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)
      useStore.getState().changePriority(0, 2, 'ais', 15000)

      useStore.getState().deletePriority(0, 1)

      const prios =
        useStore.getState().sourcePrioritiesData.sourcePriorities[0].priorities
      expect(prios).toHaveLength(2)
      expect(prios[0].sourceRef).toBe('nmea0183.0')
      expect(prios[1].sourceRef).toBe('ais')
    })

    it('should mark state as dirty', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.setState({
        sourcePrioritiesData: {
          ...useStore.getState().sourcePrioritiesData,
          saveState: { dirty: false, timeoutsOk: true }
        }
      })

      useStore.getState().deletePriority(0, 0)

      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        true
      )
    })
  })

  describe('movePriority', () => {
    it('should move priority up (change = -1)', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)

      useStore.getState().movePriority(0, 1, -1)

      const prios =
        useStore.getState().sourcePrioritiesData.sourcePriorities[0].priorities
      expect(prios[0].sourceRef).toBe('n2k.1')
      expect(prios[1].sourceRef).toBe('nmea0183.0')
    })

    it('should move priority down (change = 1)', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)

      useStore.getState().movePriority(0, 0, 1)

      const prios =
        useStore.getState().sourcePrioritiesData.sourcePriorities[0].priorities
      expect(prios[0].sourceRef).toBe('n2k.1')
      expect(prios[1].sourceRef).toBe('nmea0183.0')
    })

    it('should mark state as dirty', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)
      useStore.setState({
        sourcePrioritiesData: {
          ...useStore.getState().sourcePrioritiesData,
          saveState: { dirty: false, timeoutsOk: true }
        }
      })

      useStore.getState().movePriority(0, 0, 1)

      expect(useStore.getState().sourcePrioritiesData.saveState.dirty).toBe(
        true
      )
    })

    it('should revalidate timeouts after move', () => {
      useStore.getState().changePath(0, 'navigation.speedOverGround')
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)
      useStore.getState().changePriority(0, 2, 'ais', 15000)

      // Move third item to second position - now timeouts are 5000, 15000, 10000
      useStore.getState().movePriority(0, 2, -1)

      // After swap: index 1 has 15000, index 2 has 10000 - invalid (not increasing)
      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(false)
    })
  })

  describe('save state management', () => {
    it('setSaving should set isSaving and clear saveFailed', () => {
      useStore.getState().setSaving()

      const saveState = useStore.getState().sourcePrioritiesData.saveState
      expect(saveState.isSaving).toBe(true)
      expect(saveState.saveFailed).toBe(false)
    })

    it('setSaved should clear dirty, isSaving, and saveFailed', () => {
      useStore.getState().changePath(0, 'test')
      useStore.getState().setSaving()

      useStore.getState().setSaved()

      const saveState = useStore.getState().sourcePrioritiesData.saveState
      expect(saveState.dirty).toBe(false)
      expect(saveState.isSaving).toBe(false)
      expect(saveState.saveFailed).toBe(false)
    })

    it('setSaveFailed should set saveFailed and clear isSaving', () => {
      useStore.getState().setSaving()

      useStore.getState().setSaveFailed()

      const saveState = useStore.getState().sourcePrioritiesData.saveState
      expect(saveState.isSaving).toBe(false)
      expect(saveState.saveFailed).toBe(true)
    })

    it('clearSaveFailed should clear saveFailed', () => {
      useStore.getState().setSaveFailed()

      useStore.getState().clearSaveFailed()

      expect(
        useStore.getState().sourcePrioritiesData.saveState.saveFailed
      ).toBe(false)
    })
  })
})
