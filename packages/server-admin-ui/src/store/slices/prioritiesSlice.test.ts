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

    it('should allow non-ascending timeout values', () => {
      useStore.getState().changePriority(0, 0, 'nmea0183.0', 5000)
      useStore.getState().changePriority(0, 1, 'n2k.1', 10000)
      useStore.getState().changePriority(0, 2, 'ais', 8000) // Less than second — valid

      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(true)
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

      // After swap: index 1 has 15000, index 2 has 10000 - still valid (order doesn't matter)
      expect(
        useStore.getState().sourcePrioritiesData.saveState.timeoutsOk
      ).toBe(true)
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

describe('priorityGroups slice', () => {
  beforeEach(() => {
    useStore.setState({
      priorityGroupsData: {
        groups: [],
        saveState: { dirty: false, timeoutsOk: true }
      },
      suppressedNewcomersByGroup: {},
      retiringNewcomersByGroup: {}
    })
  })

  it('initial state has empty groups and clean save state', () => {
    const { groups, saveState } = useStore.getState().priorityGroupsData
    expect(groups).toEqual([])
    expect(saveState.dirty).toBe(false)
  })

  it('setPriorityGroupsFromServer stores groups without marking dirty', () => {
    useStore
      .getState()
      .setPriorityGroupsFromServer([{ id: 'g1', sources: ['a', 'b'] }])
    const { groups, saveState } = useStore.getState().priorityGroupsData
    expect(groups).toEqual([{ id: 'g1', sources: ['a', 'b'] }])
    expect(saveState.dirty).toBe(false)
  })

  it('reorderGroupSources swaps source positions and marks dirty', () => {
    useStore
      .getState()
      .setPriorityGroupsFromServer([{ id: 'g1', sources: ['a', 'b', 'c'] }])
    useStore.getState().reorderGroupSources('g1', 0, 2)
    const { groups, saveState } = useStore.getState().priorityGroupsData
    expect(groups[0].sources).toEqual(['b', 'c', 'a'])
    expect(saveState.dirty).toBe(true)
  })

  it('reorderGroupSources is a no-op when indices are equal', () => {
    useStore
      .getState()
      .setPriorityGroupsFromServer([{ id: 'g1', sources: ['a', 'b'] }])
    useStore.getState().reorderGroupSources('g1', 1, 1)
    expect(useStore.getState().priorityGroupsData.groups[0].sources).toEqual([
      'a',
      'b'
    ])
    // No-op must not flip dirty: the user dragged a source onto itself,
    // there is nothing to save.
    expect(useStore.getState().priorityGroupsData.saveState.dirty).toBe(false)
  })

  it('setGroupSources creates a new group when id is unknown', () => {
    useStore.getState().setGroupSources('brand-new', ['x', 'y'])
    expect(useStore.getState().priorityGroupsData.groups).toEqual([
      { id: 'brand-new', sources: ['x', 'y'], inactive: false }
    ])
    expect(useStore.getState().priorityGroupsData.saveState.dirty).toBe(true)
  })

  it('setGroupsSaving / setGroupsSaved / setGroupsSaveFailed drive save state', () => {
    useStore.getState().setGroupsSaving()
    expect(useStore.getState().priorityGroupsData.saveState.isSaving).toBe(true)

    useStore.getState().setGroupsSaveFailed()
    const after = useStore.getState().priorityGroupsData.saveState
    expect(after.isSaving).toBe(false)
    expect(after.saveFailed).toBe(true)

    useStore.getState().setGroupsSaved()
    const final = useStore.getState().priorityGroupsData.saveState
    expect(final.dirty).toBe(false)
    expect(final.saveFailed).toBe(false)
  })

  it('clearGroupsSaveFailed clears the failed flag', () => {
    useStore.getState().setGroupsSaveFailed()
    useStore.getState().clearGroupsSaveFailed()
    expect(useStore.getState().priorityGroupsData.saveState.saveFailed).toBe(
      false
    )
  })

  it('suppressNewcomerInGroup adds the source ref under the group id', () => {
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    expect(useStore.getState().suppressedNewcomersByGroup).toEqual({
      g1: ['u0183.II']
    })
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.GP')
    expect(useStore.getState().suppressedNewcomersByGroup.g1).toEqual([
      'u0183.II',
      'u0183.GP'
    ])
  })

  it('suppressNewcomerInGroup is idempotent', () => {
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    expect(useStore.getState().suppressedNewcomersByGroup.g1).toEqual([
      'u0183.II'
    ])
  })

  it('setPriorityGroupsFromServer keeps suppression but marks it retiring', () => {
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    useStore
      .getState()
      .setPriorityGroupsFromServer([
        { id: 'g1', sources: ['a'], inactive: false }
      ])
    expect(useStore.getState().suppressedNewcomersByGroup.g1).toEqual([
      'u0183.II'
    ])
    expect(useStore.getState().retiringNewcomersByGroup.g1).toEqual([
      'u0183.II'
    ])
  })

  it('pre-Save absence reconciles do not retire suppression', () => {
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    // Eviction lands before Save; reconcile shows no newcomer. Without
    // the retiring marker, suppression stays — otherwise an upstream
    // re-push between this event and Save would re-promote the row.
    useStore.getState().setReconciledGroups([
      {
        id: 'g1',
        matchedSavedId: 'g1',
        sources: ['a'],
        paths: [],
        newcomerSources: []
      }
    ])
    expect(useStore.getState().suppressedNewcomersByGroup.g1).toEqual([
      'u0183.II'
    ])
  })

  it('post-Save absence reconcile retires suppression', () => {
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    useStore
      .getState()
      .setPriorityGroupsFromServer([
        { id: 'g1', sources: ['a'], inactive: false }
      ])
    useStore.getState().setReconciledGroups([
      {
        id: 'g1',
        matchedSavedId: 'g1',
        sources: ['a'],
        paths: [],
        newcomerSources: []
      }
    ])
    expect(useStore.getState().suppressedNewcomersByGroup).toEqual({})
    expect(useStore.getState().retiringNewcomersByGroup).toEqual({})
  })

  it('post-Save reconcile that still lists the ref keeps suppression', () => {
    useStore.getState().suppressNewcomerInGroup('g1', 'u0183.II')
    useStore
      .getState()
      .setPriorityGroupsFromServer([
        { id: 'g1', sources: ['a'], inactive: false }
      ])
    // Upstream re-pushed a delta between Save and this reconcile —
    // suppression stays until a later reconcile genuinely reports
    // absence.
    useStore.getState().setReconciledGroups([
      {
        id: 'g1',
        matchedSavedId: 'g1',
        sources: ['a', 'u0183.II'],
        paths: [],
        newcomerSources: ['u0183.II']
      }
    ])
    expect(useStore.getState().suppressedNewcomersByGroup.g1).toEqual([
      'u0183.II'
    ])
    expect(useStore.getState().retiringNewcomersByGroup.g1).toEqual([
      'u0183.II'
    ])
  })
})
