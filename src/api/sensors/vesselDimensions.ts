import DeltaEditor from '../../deltaeditor'

// design.length may be stored as { overall } (current shape) or as a plain
// number (legacy single-value shape). Normalise both to the overall length,
// or undefined when it is unset. Shared so the /vessel route and the sensors
// API read it the same way and cannot drift.
export function readDesignLengthOverall(de: DeltaEditor): number | undefined {
  const length = de.getSelfValue('design.length') as
    { overall?: number } | number | undefined
  if (typeof length === 'number') return length
  if (length && typeof length === 'object') return length.overall
  return undefined
}
