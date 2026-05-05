/**
 * Walk the self-vessel Signal K tree and derive, for each PGN known to
 * carry a `instance` primary key, which `(sourceRef, instance)` tuples
 * are *currently* present.
 *
 * This replaces an earlier passive listener that accumulated every
 * instance value ever seen on the wire. That set never forgot, so a
 * value like `instance: 0` emitted briefly during a device's startup
 * Address Claim — before the user-configured instance took effect —
 * haunted conflict detection forever.
 *
 * The SK tree is the authoritative current state: a leaf at
 * `electrical.batteries.<n>.voltage` only exists while a device is
 * actively publishing instance `<n>`. Reading instances from there
 * matches what users see in the data browser and the per-PGN editors,
 * and there is nothing to decay.
 *
 * Path conventions per PGN follow the @signalk/n2k-signalk mapping
 * package. Most are `<prefix>.<instance>.<...>`; PGN 130312/130316
 * (temperature/humidity) carry an additional `source` enum that splits
 * the path as `<prefix>.<source>.<instance>.<...>`. We treat that as
 * the compound key the conflict detector already understands.
 */

// Map PGN → list of `<prefix>:<shape>` describing where in the SK tree
// the data lands. Shape is one of:
//   "<prefix>.<instance>"           — keys at depth 1 are the instance
//   "<prefix>.<source>.<instance>"  — keys at depth 1 are a string
//                                     source (e.g. "inside") and depth 2
//                                     is the numeric instance
const PGN_TREE_PATHS: Record<
  number,
  { prefix: string; shape: 'inst' | 'source-inst' }[]
> = {
  127245: [{ prefix: 'steering', shape: 'inst' }],
  127488: [{ prefix: 'propulsion', shape: 'inst' }],
  127489: [{ prefix: 'propulsion', shape: 'inst' }],
  127493: [{ prefix: 'propulsion', shape: 'inst' }],
  127497: [{ prefix: 'propulsion', shape: 'inst' }],
  127498: [{ prefix: 'propulsion', shape: 'inst' }],
  127501: [{ prefix: 'electrical.switches.bank', shape: 'inst' }],
  127503: [{ prefix: 'electrical.ac', shape: 'inst' }],
  127504: [{ prefix: 'electrical.ac', shape: 'inst' }],
  127505: [{ prefix: 'tanks', shape: 'source-inst' }],
  127506: [{ prefix: 'electrical.batteries', shape: 'inst' }],
  127508: [{ prefix: 'electrical.batteries', shape: 'inst' }],
  127513: [{ prefix: 'electrical.batteries', shape: 'inst' }],
  130311: [{ prefix: 'environment', shape: 'source-inst' }],
  130312: [{ prefix: 'environment', shape: 'source-inst' }],
  130316: [{ prefix: 'environment', shape: 'source-inst' }]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAt(root: any, dotPath: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = root
  for (const part of dotPath.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = cursor[part]
  }
  return cursor
}

/**
 * Build sourceRef → pgn → list of currently-published instance numbers.
 * Used by the admin UI conflict detector. The shape mirrors the legacy
 * passive map so the client is unchanged.
 */
export function buildPgnDataInstancesFromTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selfTree: any
): Record<string, Record<string, number[]>> {
  const out: Record<string, Record<string, Set<number>>> = {}
  if (!selfTree || typeof selfTree !== 'object') return {}

  for (const [pgn, paths] of Object.entries(PGN_TREE_PATHS)) {
    for (const { prefix, shape } of paths) {
      const node = getAt(selfTree, prefix)
      if (!node || typeof node !== 'object') continue

      if (shape === 'inst') {
        // Direct: <prefix>.<instance>.<...>
        for (const [instKey, instSubtree] of Object.entries(node)) {
          const inst = Number(instKey)
          if (!Number.isFinite(inst)) continue
          collectSourcesForInstance(instSubtree, inst, pgn, out)
        }
      } else {
        // Compound: <prefix>.<source>.<instance>.<...>
        for (const sourceSubtree of Object.values(node)) {
          if (!sourceSubtree || typeof sourceSubtree !== 'object') continue
          for (const [instKey, instSubtree] of Object.entries(sourceSubtree)) {
            const inst = Number(instKey)
            if (!Number.isFinite(inst)) continue
            collectSourcesForInstance(instSubtree, inst, pgn, out)
          }
        }
      }
    }
  }

  // Materialise sets into sorted arrays.
  const final: Record<string, Record<string, number[]>> = {}
  for (const [src, pgnMap] of Object.entries(out)) {
    const dst: Record<string, number[]> = {}
    for (const [pgn, set] of Object.entries(pgnMap)) {
      dst[pgn] = Array.from(set).sort((a, b) => a - b)
    }
    final[src] = dst
  }
  return final
}

function collectSourcesForInstance(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instSubtree: any,
  inst: number,
  pgn: string,
  out: Record<string, Record<string, Set<number>>>
): void {
  const sources = collectSources(instSubtree)
  for (const sourceRef of sources) {
    let pgnMap = out[sourceRef]
    if (!pgnMap) {
      pgnMap = {}
      out[sourceRef] = pgnMap
    }
    let set = pgnMap[pgn]
    if (!set) {
      set = new Set()
      pgnMap[pgn] = set
    }
    set.add(inst)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectSources(node: any): Set<string> {
  const out = new Set<string>()
  visit(node, out)
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function visit(node: any, out: Set<string>): void {
  if (!node || typeof node !== 'object') return
  if (typeof node.$source === 'string') out.add(node.$source)
  const values = node.values
  if (values && typeof values === 'object') {
    for (const ref of Object.keys(values)) out.add(ref)
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'meta' || k === 'value' || k === 'values' || k === 'timestamp')
      continue
    if (k === '$source' || k === 'pgn' || k === 'sentence') continue
    visit(v, out)
  }
}

/**
 * Build sourceRef → pgn → list of compound keys for temperature/humidity
 * PGNs whose unique key includes the source-type enum.
 *
 * The n2k-signalk mapping for PGN 130312/130316 routes each source-type
 * (Outside, Inside, Main Cabin, Freezer, …) to a different SK path,
 * usually flat — `environment.outside.temperature`,
 * `environment.inside.mainCabin.temperature`, etc. The numeric instance
 * is generally not part of the path either (only Live/Bait Well and
 * Exhaust Gas use pathWithIndex). Two devices "share" a 130312 stream
 * only when they publish the same SK leaf path; the path already
 * encodes the (instance, source-type) tuple uniquely. Use the relative
 * SK path as the compound key.
 */
export function buildPgnSourceKeysFromTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selfTree: any
): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, Set<string>>> = {}
  if (!selfTree || typeof selfTree !== 'object') return {}

  for (const [pgn, paths] of Object.entries(PGN_TREE_PATHS)) {
    for (const { prefix, shape } of paths) {
      if (shape !== 'source-inst') continue
      const node = getAt(selfTree, prefix)
      if (!node || typeof node !== 'object') continue
      collectLeafPaths(node, prefix, pgn, out)
    }
  }

  const final: Record<string, Record<string, string[]>> = {}
  for (const [src, pgnMap] of Object.entries(out)) {
    const dst: Record<string, string[]> = {}
    for (const [pgn, set] of Object.entries(pgnMap)) {
      dst[pgn] = Array.from(set).sort()
    }
    final[src] = dst
  }
  return final
}

// Walk the subtree under a PGN's prefix and, for every leaf that carries
// data, record its full SK path against each contributing sourceRef.
function collectLeafPaths(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node: any,
  path: string,
  pgn: string,
  out: Record<string, Record<string, Set<string>>>
): void {
  if (!node || typeof node !== 'object') return
  const isLeaf =
    Object.prototype.hasOwnProperty.call(node, 'value') ||
    Object.prototype.hasOwnProperty.call(node, 'values') ||
    typeof node.$source === 'string'
  if (isLeaf) {
    for (const sourceRef of collectSources(node)) {
      let pgnMap = out[sourceRef]
      if (!pgnMap) {
        pgnMap = {}
        out[sourceRef] = pgnMap
      }
      let set = pgnMap[pgn]
      if (!set) {
        set = new Set()
        pgnMap[pgn] = set
      }
      set.add(path)
    }
    return
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'meta' || k === 'timestamp') continue
    collectLeafPaths(v, `${path}.${k}`, pgn, out)
  }
}
