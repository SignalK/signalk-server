import { describe, expect, it } from 'vitest'

import { savedMembership } from './sourceGroups'

describe('savedMembership', () => {
  it('keeps the ranking untouched when there is nothing new', () => {
    const group = {
      sources: ['can1.a', 'can2.b'],
      newcomerSources: []
    }
    expect(savedMembership(group)).toEqual(['can1.a', 'can2.b'])
  })

  it('leaves an unaccepted newcomer out of the saved membership', () => {
    // An unrelated Save (a fallback timeout, one override row) must not make
    // an outside source a group member: the engine would then rank every
    // other path that source publishes through this group.
    const group = {
      sources: ['can1.a', 'can2.b', 'pluginSource'],
      newcomerSources: ['pluginSource']
    }
    expect(savedMembership(group)).toEqual(['can1.a', 'can2.b'])
  })

  it('keeps a source the user has accepted', () => {
    // Accepting writes it into the group's ordering, so it is no longer
    // listed as a newcomer.
    const group = {
      sources: ['can1.a', 'can2.b', 'pluginSource'],
      newcomerSources: []
    }
    expect(savedMembership(group)).toEqual(['can1.a', 'can2.b', 'pluginSource'])
  })

  it('keeps an auto-derived group whole', () => {
    // A group the user has never saved has no newcomers; saving it stores the
    // discovered ordering as it stands.
    const group = {
      sources: ['can1.a', 'can2.b', 'can3.c'],
      newcomerSources: []
    }
    expect(savedMembership(group)).toHaveLength(3)
  })

  it('drops every unaccepted newcomer at once', () => {
    const group = {
      sources: ['can1.a', 'newOne', 'can2.b', 'newTwo'],
      newcomerSources: ['newOne', 'newTwo']
    }
    expect(savedMembership(group)).toEqual(['can1.a', 'can2.b'])
  })
})
