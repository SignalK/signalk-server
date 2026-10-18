// On a SocketCAN connection (canbus-canboatjs), the N2K filter rows that
// name only a PGN can be handed to canboatjs as excludePgns. canboatjs sets
// them as the CAN socket's filter, so the kernel drops those frames before
// they are parsed. canboatjs versions without excludePgns ignore the option;
// n2k-signalk still applies every filter row after parsing either way.

type ExcludePgns = Array<number | string> | string | number | undefined

interface FilterOptions {
  filters?: Array<{ source?: string; pgn?: string }>
  filtersEnabled?: boolean
  filtersInKernel?: boolean
  excludePgns?: ExcludePgns
}

/**
 * The excludePgns to pass to canboatjs. With the filters and
 * filtersInKernel on: the PGN-only filter rows, added to an excludePgns
 * already in the options. Otherwise the options' own excludePgns.
 *
 * A row counts only if n2k-signalk's filter matches it the same way: no
 * source, and a PGN in decimal digits without leading zeros, as that
 * filter compares it as a string. canboatjs checks the PGNs and warns about the ones it skips.
 */
export function kernelExcludePgns(options: FilterOptions): ExcludePgns {
  if (!options.filtersEnabled || !options.filtersInKernel) {
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
