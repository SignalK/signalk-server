/**
 * Two-letter monogram used as the icon fallback for webapps and plugins that
 * ship no app icon.
 */

// Punctuation is never part of a monogram: a display name like
// "Voice (Wyoming)" reads as "VW", not "V(".
const WORD = /[\p{L}\p{N}]+/gu
const MONOGRAM_LENGTH = 2

export function monogramFor(name: string, displayName?: string): string {
  const source = (displayName || name).replace(/^@[^/]+\//, '')
  const words = source.match(WORD)
  if (!words) return '?'
  // Uppercase each word before taking its initial, not the joined result: ß
  // maps to SS, so uppercasing afterwards would overflow MONOGRAM_LENGTH and
  // truncating that would drop the second word's initial. Slice by code
  // point too — a supplementary-plane letter like 𠮷 is two UTF-16 units,
  // and splitting those apart yields a lone surrogate.
  const initials =
    words.length === 1
      ? Array.from(words[0].toUpperCase()).slice(0, MONOGRAM_LENGTH)
      : [words[0], words[1]].map((word) => Array.from(word.toUpperCase())[0])
  return initials.join('')
}
