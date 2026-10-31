// The N2K filter rows that name only a PGN can be handed to canboatjs as
// excludePgns, so it drops those messages before decoding them: in the
// kernel on a SocketCAN connection (canbus-canboatjs), and before
// reassembly and decoding on every other one. n2k-signalk still applies
// every filter row after decoding either way.

type ExcludePgns = Array<number | string> | string | number | undefined

interface FilterOptions {
  filters?: Array<{ source?: string; pgn?: string }>
  filtersEnabled?: boolean
  filtersBeforeDecoding?: boolean
  excludePgns?: ExcludePgns
}

/**
 * Whether the installed canboatjs drops excludePgns (canboatjs#536). An
 * older one ignores the option, so the filters then still apply only after
 * decoding.
 */
export function canboatjsSupportsExcludePgns(
  canboatjs: unknown = require('@canboat/canboatjs')
): boolean {
  return (
    typeof (canboatjs as { parseExcludePgns?: unknown }).parseExcludePgns ===
    'function'
  )
}

/**
 * The excludePgns to pass to canboatjs. With the filters and
 * filtersBeforeDecoding on: the PGN-only filter rows, added to an
 * excludePgns already in the options. Otherwise the options' own
 * excludePgns.
 *
 * A row counts only if n2k-signalk's filter matches it the same way: no
 * source, and a PGN in decimal digits without leading zeros, as that
 * filter compares it as a string. canboatjs checks the PGNs and warns
 * about the ones it skips, such as network management.
 */
export function excludePgnsFromFilters(options: FilterOptions): ExcludePgns {
  if (!options.filtersEnabled || !options.filtersBeforeDecoding) {
    return options.excludePgns
  }
  const fromRows = (options.filters ?? [])
    .filter((f) => !f.source || f.source.length === 0)
    .map((f) => f.pgn)
    .filter((pgn): pgn is string => typeof pgn === 'string')
    .filter((pgn) => /^(0|[1-9]\d*)$/.test(pgn))
  const given = options.excludePgns
  const givenList = Array.isArray(given)
    ? given
    : typeof given === 'string'
      ? given.split(/[\s,]+/).filter((s) => s !== '')
      : given === undefined
        ? []
        : [given]
  return [...givenList, ...fromRows]
}
