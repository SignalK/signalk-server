import { describe, it, expect } from 'vitest'
import { findContextName, pathToUrlSegments } from './pathUtils'

describe('findContextName', () => {
  it('resolves the name from a source-suffixed key', () => {
    const contextData = {
      'name$AIS.123': { value: 'Black Pearl' },
      'navigation.position$AIS.123': { value: { latitude: 1, longitude: 2 } }
    }
    expect(findContextName(contextData)).toBe('Black Pearl')
  })

  it('resolves the name from a bare key', () => {
    expect(findContextName({ name: { value: 'Flying Dutchman' } })).toBe(
      'Flying Dutchman'
    )
  })

  it('does not match paths that merely start with name', () => {
    const contextData = {
      'nameplate$AIS.1': { value: 'ABC123' }
    }
    expect(findContextName(contextData)).toBeUndefined()
  })

  it('returns undefined when no name leaf is present', () => {
    const contextData = {
      'mmsi$AIS.123': { value: '123456789' }
    }
    expect(findContextName(contextData)).toBeUndefined()
  })

  it('returns undefined for missing context data', () => {
    expect(findContextName(undefined)).toBeUndefined()
  })

  it('ignores a non-string name value', () => {
    expect(findContextName({ 'name$AIS.1': { value: 42 } })).toBeUndefined()
  })

  it('skips a non-string name entry for a later valid one', () => {
    const contextData = {
      'name$AIS.1': { value: 42 },
      'name$AIS.2': { value: 'Black Pearl' }
    }
    expect(findContextName(contextData)).toBe('Black Pearl')
  })
})

describe('pathToUrlSegments', () => {
  it('turns dots into slashes for ordinary paths', () => {
    expect(pathToUrlSegments('tanks.freshWater.2.currentLevel')).toBe(
      'tanks/freshWater/2/currentLevel'
    )
  })

  it('URL-encodes characters that would change the request target', () => {
    expect(pathToUrlSegments('environment.we#ird.a?b.100%')).toBe(
      'environment/we%23ird/a%3Fb/100%25'
    )
  })

  it('cannot produce a ".." segment — dots are separators', () => {
    // Consecutive dots become empty segments, so upward traversal via
    // a literal '..' segment is structurally impossible.
    expect(pathToUrlSegments('a...b')).toBe('a///b')
  })
})
