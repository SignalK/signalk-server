import { describe, it, expect } from 'vitest'
import { pluginCountLabel } from './pluginCountLabel'

describe('pluginCountLabel', () => {
  it('reports the total when nothing is filtered out', () => {
    expect(pluginCountLabel(77, 77)).toBe('77 plugins')
  })

  it('reports both counts when a filter hides some plugins', () => {
    expect(pluginCountLabel(3, 77)).toBe('Showing 3 of 77 plugins')
  })

  it('reports both counts when a filter matches nothing', () => {
    expect(pluginCountLabel(0, 77)).toBe('Showing 0 of 77 plugins')
  })

  it('singularises a single installed plugin', () => {
    expect(pluginCountLabel(1, 1)).toBe('1 plugin')
  })

  it('singularises a single installed plugin hidden by a filter', () => {
    expect(pluginCountLabel(0, 1)).toBe('Showing 0 of 1 plugin')
  })

  it('describes an empty install without counts', () => {
    expect(pluginCountLabel(0, 0)).toBe('No plugins installed')
  })
})
