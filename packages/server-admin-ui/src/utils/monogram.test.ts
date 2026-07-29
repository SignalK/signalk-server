import { describe, it, expect } from 'vitest'
import { monogramFor } from './monogram'

describe('monogramFor', () => {
  it('takes the initials of the first two words', () => {
    expect(monogramFor('sailing-dashboard')).toBe('SD')
  })

  it('takes two letters from a single-word name', () => {
    expect(monogramFor('freeboard')).toBe('FR')
  })

  it('ignores punctuation between words', () => {
    expect(monogramFor('voice-wyoming', 'Voice (Wyoming)')).toBe('VW')
  })

  it('ignores leading punctuation on a single word', () => {
    expect(monogramFor('wyoming', '(Wyoming)')).toBe('WY')
  })

  it('prefers the display name over the package name', () => {
    expect(monogramFor('@signalk/instrumentpanel', 'Instrument Panel')).toBe(
      'IP'
    )
  })

  it('strips the npm scope from a package name', () => {
    expect(monogramFor('@signalk/freeboard-sk')).toBe('FS')
  })

  it('keeps digits', () => {
    expect(monogramFor('nmea 2000')).toBe('N2')
  })

  it('keeps non-latin letters', () => {
    expect(monogramFor('koersvast', 'Кораблик Навигатор')).toBe('КН')
  })

  it('keeps a supplementary-plane letter whole across two words', () => {
    expect(monogramFor('kanji', '𠮷 Atlas')).toBe('𠮷A')
  })

  it('keeps supplementary-plane letters whole in a single word', () => {
    expect(monogramFor('kanji', '𠮷𠮷𠮷')).toBe('𠮷𠮷')
  })

  it('keeps the second initial when uppercasing expands the first', () => {
    expect(monogramFor('eszett', 'ß Atlas')).toBe('SA')
  })

  it('stays two characters when a single word uppercases wider', () => {
    expect(monogramFor('eszett', 'ßß')).toBe('SS')
  })

  it('falls back to a placeholder when there is nothing to take', () => {
    expect(monogramFor('---', '(!)')).toBe('?')
  })
})
