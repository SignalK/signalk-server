import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useDeferredValue
} from 'react'
import Select, {
  components,
  type OptionProps,
  type SingleValue
} from 'react-select'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import dayjs from 'dayjs'
import VirtualizedDataTable from './VirtualizedDataTable'
import type { PathData, MetaData } from '../../store'
import {
  buildSourceLabel,
  canonicaliseSourceRef,
  type SourcesData
} from '../../utils/sourceLabels'
import granularSubscriptionManager from './GranularSubscriptionManager'
import { getPath$SourceKey, getPathFromKey } from './pathUtils'
import {
  useWebSocket,
  useDeltaMessages,
  getWebSocketService
} from '../../hooks/useWebSocket'
import {
  useStore,
  useShallow,
  useUnitPrefsLoaded,
  useConfiguredPriorityPaths,
  usePreferredSourceByPath,
  useLivePreferredSources,
  useSourcePrioritiesLoaded,
  useDiscoveredAddresses
} from '../../store'

const getSignalkData = () => useStore.getState().signalkData

const TIMESTAMP_FORMAT = 'MM/DD HH:mm:ss'
const TIME_ONLY_FORMAT = 'HH:mm:ss'

const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const rawStorageKey = 'admin.v1.dataBrowser.v1.raw'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'
const viewBySourceStorageKey = 'admin.v1.dataBrowser.viewBySource'
const sourceFilterStorageKey = 'admin.v1.dataBrowser.sourceFilter'

const HEADER_PREFIX = '__header__\0'

function matchesSearch(key: string, search: string): boolean {
  if (!search || search.length === 0) return true
  const lowerKey = key.toLowerCase()
  const terms = search
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  if (terms.length === 0) return true
  return terms.some((term) => lowerKey.includes(term))
}

interface DeltaMessage {
  context?: string
  updates?: Array<{
    timestamp: string
    $source?: string
    source?: {
      pgn?: number
      sentence?: string
    }
    values?: Array<{
      path: string
      value: unknown
    }>
    meta?: Array<{
      path: string
      value: unknown
    }>
  }>
}

interface SelectOption {
  label: string
  value: string
  section?: 'all' | 'self' | 'ais'
  isFirstAis?: boolean
}

const ContextOption = (props: OptionProps<SelectOption>) => {
  const { data } = props
  const needsBorder = data.value === 'self' || data.isFirstAis
  return (
    <div style={needsBorder ? { borderTop: '1px solid #ccc' } : undefined}>
      <components.Option {...props} />
    </div>
  )
}

const DataBrowser: React.FC = () => {
  const { ws: webSocket, isConnected, skSelf } = useWebSocket()

  const [hasData, setHasData] = useState(false)
  const [pause, setPause] = useState(
    () => localStorage.getItem(pauseStorageKey) === 'true'
  )
  const [raw, setRaw] = useState(
    () => localStorage.getItem(rawStorageKey) === 'true'
  )
  const [context, setContext] = useState(
    () => localStorage.getItem(contextStorageKey) || 'self'
  )
  const [search, setSearch] = useState(
    () => localStorage.getItem(searchStorageKey) || ''
  )
  const [viewBySource, setViewBySource] = useState(
    () => localStorage.getItem(viewBySourceStorageKey) === 'true'
  )
  const [sourceFilter, setSourceFilter] = useState(
    () => localStorage.getItem(sourceFilterStorageKey) !== 'false'
  )
  const [rawSourcesData, setRawSourcesData] = useState<SourcesData | null>(null)
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(
    () => new Set()
  )
  // Debounce + dedupe for source-info refetches triggered by deltas
  // whose $source isn't yet in our local sourcesData mirror. Coalesces
  // bursts of new-source events (e.g. when a remote SK upstream
  // finishes its discovery sweep and starts emitting fresh metadata
  // for many devices at once) into one /signalk/v1/api/sources fetch.
  const sourcesRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  )
  const lastSourcesRefetchAtRef = useRef<number>(0)
  const rawSourcesDataRef = useRef<SourcesData | null>(null)

  const deferredSearch = useDeferredValue(search)
  const isSearchStale = search !== deferredSearch

  const dataVersion = useStore((s) => s.dataVersion)

  const contextKeys = useStore(
    useShallow((s) => Object.keys(s.signalkData).sort())
  )

  const updatePath = useStore((s) => s.updatePath)
  const updateMeta = useStore((s) => s.updateMeta)
  const getPathData = useStore((s) => s.getPathData)

  const unitPrefsLoaded = useUnitPrefsLoaded()
  const fetchUnitPreferences = useStore((s) => s.fetchUnitPreferences)
  const configuredPriorityPaths = useConfiguredPriorityPaths()
  const preferredSourceByPath = usePreferredSourceByPath()
  const livePreferredSourcesRaw = useLivePreferredSources()
  const sourcePrioritiesLoaded = useSourcePrioritiesLoaded()
  const discoveredAddresses = useDiscoveredAddresses()

  // Paths the user has flagged for fan-out (sentinel '*' override).
  // Used to suppress the "Preferred" badge — a fan-out path delivers
  // every source, so no single row is the engine's preferred.
  const fanOutPaths = useMemo(() => {
    const set = new Set<string>()
    for (const [path, ref] of preferredSourceByPath) {
      if (ref === '*') set.add(path)
    }
    return set
  }, [preferredSourceByPath])

  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)
  const isMountedRef = useRef(true)
  // Mirror of filteredPathKeys, kept fresh so subscribeToDataIfNeeded
  // can re-request the current paths after a reconnect without taking
  // a dependency on the memo (which would tear down and rebuild the
  // discovery flow on every keystroke).
  const filteredPathKeysRef = useRef<string[]>([])

  const loadSources = useCallback(async (): Promise<SourcesData> => {
    const response = await fetch(`/signalk/v1/api/sources`, {
      credentials: 'include'
    })
    return (await response.json()) as SourcesData
  }, [])

  // Trigger a debounced /signalk/v1/api/sources refetch. Used when the
  // delta stream surfaces a $source we don't yet have device-info for
  // — typical for a Signal K WS upstream that finishes its discovery
  // sweep after this client has already mounted. The 1.5s debounce
  // collapses bursts of fresh sources into one fetch, and a 5s floor
  // between fetches keeps a bus full of fast-arriving canName flips
  // from hammering the REST endpoint.
  const scheduleSourcesRefetch = useCallback(() => {
    if (sourcesRefetchTimerRef.current) return
    const sinceLast = Date.now() - lastSourcesRefetchAtRef.current
    const delay = sinceLast < 5000 ? 5000 - sinceLast + 1500 : 1500
    sourcesRefetchTimerRef.current = setTimeout(() => {
      sourcesRefetchTimerRef.current = null
      lastSourcesRefetchAtRef.current = Date.now()
      loadSources()
        .then((sourcesData) => {
          if (isMountedRef.current) {
            setRawSourcesData(sourcesData)
          }
        })
        .catch((err) =>
          console.warn('Delta-triggered sources refetch failed:', err)
        )
    }, delay)
  }, [loadSources])

  // Decide whether an incoming delta carries a $source we don't have
  // device-info for in our local sourcesData mirror. Two checks:
  //   - the connection.address entry exists at all,
  //   - if it does, it has manufacturer / model / serial filled in
  //     (the fields the WS upstream's discovery sweep eventually
  //     populates server-side and forwards on the next data delta
  //     for this source).
  // A miss on either count schedules a refetch so the admin UI's
  // labels / Source-Discovery page catch up without a manual reload.
  const needsSourcesRefetch = useCallback(
    (sourceRef: string | undefined): boolean => {
      if (!sourceRef) return false
      const dotIdx = sourceRef.indexOf('.')
      if (dotIdx === -1) return false
      const conn = sourceRef.slice(0, dotIdx)
      const addr = sourceRef.slice(dotIdx + 1)
      const tree = rawSourcesDataRef.current
      if (!tree) return false
      const connNode = tree[conn] as Record<string, unknown> | undefined
      if (!connNode) return true
      const dev = connNode[addr] as
        | { n2k?: { manufacturerCode?: string; modelId?: string } }
        | undefined
      if (!dev) return true
      // For non-N2K sources (no n2k subtree), there's nothing to
      // populate later — don't bother refetching. For N2K, refetch
      // until we've got both manufacturer and model.
      if (!dev.n2k) return false
      return !dev.n2k.manufacturerCode && !dev.n2k.modelId
    },
    []
  )

  const handleMessage = useCallback(
    (msg: unknown) => {
      if (pause) {
        return
      }

      const currentSkSelf = getWebSocketService().getSkSelf()
      const deltaMsg = msg as DeltaMessage

      if (!currentSkSelf) {
        return
      }

      if (deltaMsg.context && deltaMsg.updates) {
        const key =
          deltaMsg.context === currentSkSelf ? 'self' : deltaMsg.context

        let isNew = false

        deltaMsg.updates.forEach((update) => {
          if (update.$source && needsSourcesRefetch(update.$source as string)) {
            scheduleSourcesRefetch()
          }
          if (update.values) {
            const pgn =
              update.source && update.source.pgn && `(${update.source.pgn})`
            const sentence =
              update.source &&
              update.source.sentence &&
              `(${update.source.sentence})`

            update.values.forEach((vp) => {
              const timestamp = dayjs(update.timestamp)
              const formattedTimestamp = timestamp.isSame(dayjs(), 'day')
                ? timestamp.format(TIME_ONLY_FORMAT)
                : timestamp.format(TIMESTAMP_FORMAT)

              if (vp.path === '') {
                if (vp.value && typeof vp.value === 'object') {
                  Object.keys(vp.value as object).forEach((k) => {
                    const path$SourceKey = getPath$SourceKey(k, update.$source)
                    const pathData: PathData = {
                      path: k,
                      value: (vp.value as Record<string, unknown>)[k],
                      $source: update.$source,
                      pgn: pgn || undefined,
                      sentence: sentence || undefined,
                      timestamp: formattedTimestamp
                    }
                    const wasNew = !getPathData(key, path$SourceKey)
                    updatePath(key, path$SourceKey, pathData)
                    if (wasNew) isNew = true
                  })
                }
              } else {
                const path$SourceKey = getPath$SourceKey(
                  vp.path,
                  update.$source
                )
                const pathData: PathData = {
                  path: vp.path,
                  $source: update.$source,
                  value: vp.value,
                  pgn: pgn || undefined,
                  sentence: sentence || undefined,
                  timestamp: formattedTimestamp
                }
                const wasNew = !getPathData(key, path$SourceKey)
                updatePath(key, path$SourceKey, pathData)
                if (wasNew) isNew = true
              }
            })
          }
          if (update.meta) {
            update.meta.forEach((vp) => {
              updateMeta(key, vp.path, vp.value as Partial<MetaData>)
            })
          }
        })

        if ((isNew || (context && context === key)) && !hasData) {
          setHasData(true)
        }
      }
    },
    [
      pause,
      context,
      hasData,
      updatePath,
      updateMeta,
      getPathData,
      needsSourcesRefetch,
      scheduleSourcesRefetch
    ]
  )

  useDeltaMessages(handleMessage)

  const subscribeToDataIfNeeded = useCallback(() => {
    if (
      !pause &&
      webSocket &&
      isConnected &&
      skSelf &&
      (webSocket !== webSocketRef.current || didSubscribeRef.current === false)
    ) {
      const isReconnect = webSocketRef.current !== null
      granularSubscriptionManager.setWebSocket(
        webSocket as unknown as WebSocket
      )
      granularSubscriptionManager.setSourcePolicy(
        sourceFilter ? 'preferred' : 'all'
      )
      granularSubscriptionManager.startDiscovery()

      // After a reconnect (server reboot / network blip) the store
      // already holds the previously-subscribed paths, so dataVersion
      // does not increment when their cached values come back, and
      // the table's dataKeys memo holds the same reference — its
      // resubscribe effect never re-fires. Without an explicit
      // re-request here, the new WS only delivers the discovery
      // snapshot (one update per path) and then goes silent because
      // the manager's path subscription set was cleared by
      // startDiscovery. Re-issue the current paths so the engine
      // resumes pushing ongoing updates.
      if (isReconnect) {
        const dataKeys = filteredPathKeysRef.current.filter(
          (k) => !k.startsWith(HEADER_PREFIX)
        )
        if (dataKeys.length > 0) {
          granularSubscriptionManager.requestPaths(dataKeys)
        }
      }

      webSocketRef.current = webSocket
      didSubscribeRef.current = true
    }
  }, [pause, webSocket, isConnected, skSelf, sourceFilter])

  // Mirror rawSourcesData into a ref so the WS delta handler can
  // check "do we already know this $source?" without re-binding via a
  // dep change every time sourcesData updates.
  useEffect(() => {
    rawSourcesDataRef.current = rawSourcesData
  }, [rawSourcesData])

  useEffect(() => {
    isMountedRef.current = true

    loadSources()
      .then((sourcesData) => {
        if (isMountedRef.current) {
          setRawSourcesData(sourcesData)
        }
      })
      .catch((err) => console.warn('Failed to load sources:', err))

    if (!unitPrefsLoaded) {
      fetchUnitPreferences()
    }

    return () => {
      isMountedRef.current = false
      if (sourcesRefetchTimerRef.current) {
        clearTimeout(sourcesRefetchTimerRef.current)
        sourcesRefetchTimerRef.current = null
      }
    }
  }, [loadSources, unitPrefsLoaded, fetchUnitPreferences])

  // Re-fetch sourcesData whenever the N2K discovery surface changes.
  // /signalk/v1/api/sources is fetched once on mount; without this
  // hook a page loaded before discovery completes shows only canName
  // labels and never recovers, because the WS delta stream doesn't
  // ship the manufacturer/model/serial fields. discoveredAddresses
  // is pushed via N2KDEVICESTATUS — its array reference changes
  // every time the device set updates, so this effect fires exactly
  // when fresh metadata is likely available on the REST endpoint.
  useEffect(() => {
    if (pause) return
    if (!discoveredAddresses || discoveredAddresses.length === 0) return
    let cancelled = false
    loadSources()
      .then((sourcesData) => {
        if (!cancelled && isMountedRef.current) {
          setRawSourcesData(sourcesData)
        }
      })
      .catch((err) => console.warn('Failed to refresh sources:', err))
    return () => {
      cancelled = true
    }
  }, [discoveredAddresses, loadSources, pause])

  const contextOptions: SelectOption[] = useMemo(() => {
    const currentData = getSignalkData()
    const options: SelectOption[] = [
      { value: 'all', label: 'ALL', section: 'all' }
    ]

    if (contextKeys.includes('self')) {
      const contextData = currentData['self']?.['name'] as
        | { value?: string }
        | undefined
      const contextName = contextData?.value
      options.push({
        value: 'self',
        label: `${contextName || ''} self`,
        section: 'self'
      })
    }

    let isFirst = true
    contextKeys.forEach((key) => {
      if (key !== 'self') {
        const contextData = currentData[key]?.['name'] as
          | { value?: string }
          | undefined
        const contextName = contextData?.value
        options.push({
          value: key,
          label: `${contextName || ''} ${key}`,
          section: 'ais',
          isFirstAis: isFirst
        })
        isFirst = false
      }
    })

    return options
  }, [contextKeys])

  useEffect(() => {
    subscribeToDataIfNeeded()
  }, [subscribeToDataIfNeeded])

  useEffect(() => {
    return () => {
      granularSubscriptionManager.unsubscribeAll()
      didSubscribeRef.current = false
    }
  }, [])

  const handleContextChange = useCallback(
    (selectedOption: SingleValue<SelectOption>) => {
      const value = selectedOption ? selectedOption.value : 'none'
      setContext(value)
      localStorage.setItem(contextStorageKey, value)
    },
    []
  )

  const currentContext: SelectOption | null =
    contextOptions.find((option) => option.value === context) || null

  const handleSearch = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setSearch(value)
      localStorage.setItem(searchStorageKey, value)
    },
    []
  )

  const showContext = context === 'all'

  // Live "currently winning" source per path according to the server's
  // priority engine. Distinct from preferredSourceByPath (the saved
  // configuration's rank-1): the engine falls back to a lower-ranked
  // source when rank-1 is silent past its timeout, and that change is
  // pushed to us via the LIVEPREFERREDSOURCES server event. The DataBrowser
  // uses this for the "Preferred" badge and for "Priority filtered"
  // dedup so display tracks the actual winner instead of the user's
  // configured #1.
  //
  // Server keys are `${context}\0${path}` (e.g.
  // `vessels.urn:mrn:signalk:uuid:...\0environment.wind.speedApparent`)
  // while the DataBrowser keys self-data as `'self'`. Build a per-context
  // map keyed by path so consumers can look up "self" or full vessel
  // contexts uniformly.
  const liveWinnerByPath: Map<string, Map<string, string>> = useMemo(() => {
    const out = new Map<string, Map<string, string>>()
    for (const [composite, src] of Object.entries(livePreferredSourcesRaw)) {
      const sep = composite.indexOf('\0')
      if (sep < 0) continue
      const ctxKey = composite.slice(0, sep)
      const path = composite.slice(sep + 1)
      const uiCtx = skSelf && ctxKey === skSelf ? 'self' : ctxKey
      let perCtx = out.get(uiCtx)
      if (!perCtx) {
        perCtx = new Map<string, string>()
        out.set(uiCtx, perCtx)
      }
      perCtx.set(path, src)
    }
    return out
  }, [livePreferredSourcesRaw, skSelf])

  // Note: an earlier version of this file pruned signalkData entries
  // whose $source didn't match the engine's current winner, gated on
  // "Priority filtered" mode. That was destructive — switching back
  // to "All sources" had no rows for the loser sources because they
  // had been deleted from the local mirror, and a stale source whose
  // upstream had stopped publishing could never be recovered. The
  // dedup loop in filteredPathKeys already handles the visible-row
  // selection per mode, so the local mirror is kept complete and the
  // mode switch is purely a render-time filter.

  const liveWinnerForCurrentContext: Map<string, string> = useMemo(() => {
    if (context === 'all') {
      // Flatten across contexts but keep context in the key — two
      // vessels with the same path can have different winners, so a
      // path-only key would silently overwrite one with the other.
      // DataRow rebuilds the same composite key when showContext is on.
      const flat = new Map<string, string>()
      for (const [ctx, perCtx] of liveWinnerByPath) {
        for (const [path, src] of perCtx) {
          flat.set(`${ctx}\0${path}`, src)
          // Also publish under the alternate context key so DataRow's
          // preferredKey lookup hits regardless of whether the row
          // resolved its context via skSelf collapsing or the full
          // UUID. Otherwise the badge stays dark for self-vessel rows
          // when one side keyed self by uuid and the other by 'self'.
          if (ctx === 'self' && skSelf) {
            flat.set(`${skSelf}\0${path}`, src)
          } else if (skSelf && ctx === skSelf) {
            flat.set(`self\0${path}`, src)
          }
        }
      }
      return flat
    }
    // The map is keyed by `'self'` once skSelf is known, but can
    // also carry the full vessel UUID — for example when a
    // LIVEPREFERREDSOURCES event lands before the WS hello has
    // populated skSelf. Try both so the badge / dedup never go dark
    // because of that race.
    const direct = liveWinnerByPath.get(context)
    if (direct && direct.size > 0) return direct
    if (context === 'self' && skSelf) {
      const byUuid = liveWinnerByPath.get(skSelf)
      if (byUuid) return byUuid
    }
    return direct ?? new Map<string, string>()
  }, [liveWinnerByPath, context, skSelf])

  // Set of paths the priority engine is actively routing for the
  // current context — i.e. paths where there is a live winner. Used
  // by DataRow to suppress the "no priority configured" warning when
  // a group ranking covers the path (configuredPriorityPaths only
  // tracks path-level overrides, not group rankings).
  const routedPaths: Set<string> = useMemo(() => {
    return new Set(liveWinnerForCurrentContext.keys())
  }, [liveWinnerForCurrentContext])

  const filteredPathKeys: string[] = useMemo(() => {
    const currentData = dataVersion >= 0 ? getSignalkData() : {}
    const contexts = context === 'all' ? Object.keys(currentData) : [context]

    let filtered: string[] = []

    const sourceLabels = new Map<string, string>()
    const getLabel = (src: string): string => {
      if (!src) return ''
      let label = sourceLabels.get(src)
      if (label === undefined) {
        label = buildSourceLabel(src, rawSourcesData)
        sourceLabels.set(src, label)
      }
      return label
    }

    for (const ctx of contexts) {
      const contextData = currentData[ctx] || {}
      for (const key of Object.keys(contextData)) {
        const pathData = contextData[key] as PathData | undefined
        const source = pathData?.$source || ''
        const pgn = pathData?.pgn || ''
        const sentence = pathData?.sentence || ''
        if (
          !matchesSearch(key, deferredSearch) &&
          !matchesSearch(source, deferredSearch) &&
          !matchesSearch(getLabel(source), deferredSearch) &&
          !matchesSearch(pgn, deferredSearch) &&
          !matchesSearch(sentence, deferredSearch)
        ) {
          continue
        }
        filtered.push(context === 'all' ? `${ctx}\0${key}` : key)
      }
    }

    // In "Priority filtered" mode, paths that have a preferred source
    // configured collapse to a single row — the one whose source matches
    // the live winner reported by the server's priority engine. The
    // engine handles fallback (rank-2 takes over after rank-1 has been
    // silent past its timeout); the LIVEPREFERREDSOURCES feed tells us
    // who is currently winning so display tracks that decision.
    //
    // Paths with no priority config (e.g. a deactivated group) fan out
    // — there is nothing to filter against, so showing every source
    // matches the user's expectation that disabling priority reveals
    // the full picture. Both layouts apply the same rule so toggling
    // By Path / By Source never appears to bypass the filter.
    if (sourceFilter) {
      const seenPaths = new Map<string, string>()
      // Tracks each incumbent's index in `deduped` so the swap below is
      // O(1) instead of O(n) — important when the path set is large.
      const indexByKey = new Map<string, number>()
      const deduped: string[] = []
      for (const compositeKey of filtered) {
        const nullIdx = compositeKey.indexOf('\0')
        const realKey =
          nullIdx >= 0 ? compositeKey.slice(nullIdx + 1) : compositeKey
        const path = getPathFromKey(realKey)
        // Notifications are events, not measurements — the priority engine
        // delivers every source's notification (see deltaPriority.ts), so
        // the Data Browser must fan them out 1:1 even when a stale priority
        // entry exists for the path.
        if (path === 'notifications' || path.startsWith('notifications.')) {
          deduped.push(compositeKey)
          continue
        }
        // Fan-out path: the user explicitly opted out of priority
        // filtering for this path (e.g. satellitesInView from multiple
        // GPSes). Stored as the sentinel sourceRef '*'; surface every
        // source like notifications.
        if (preferredSourceByPath.get(path) === '*') {
          deduped.push(compositeKey)
          continue
        }
        const ctxPrefix = nullIdx >= 0 ? compositeKey.slice(0, nullIdx) : ''
        const dedupKey = ctxPrefix ? `${ctxPrefix}\0${path}` : path
        // In "all" mode the per-row prefix is the full vessel UUID,
        // but liveWinnerByPath may have collapsed self under 'self'.
        // Try the UUID first, then 'self' when the row matches skSelf.
        const liveWinner =
          context === 'all'
            ? (liveWinnerByPath.get(ctxPrefix)?.get(path) ??
              (skSelf && ctxPrefix === skSelf
                ? (liveWinnerByPath.get('self')?.get(path) ?? null)
                : null))
            : (liveWinnerForCurrentContext.get(path) ?? null)
        // No live winner means the engine is not filtering this path
        // (no override, source not in any active group). Show every row.
        if (!liveWinner) {
          deduped.push(compositeKey)
          continue
        }
        const incomingData = currentData[ctxPrefix || context]?.[realKey] as
          | PathData
          | undefined
        // Server emits livePreferredSources in canonical (canName) form;
        // canonicalise the incoming raw $source before comparing so the
        // dedup decision matches the engine's identity rule.
        const incomingMatches =
          canonicaliseSourceRef(incomingData?.$source ?? '', rawSourcesData) ===
          liveWinner

        if (!seenPaths.has(dedupKey)) {
          seenPaths.set(dedupKey, compositeKey)
          indexByKey.set(compositeKey, deduped.length)
          deduped.push(compositeKey)
        } else if (incomingMatches) {
          const incumbentKey = seenPaths.get(dedupKey)!
          const oldIdx = indexByKey.get(incumbentKey)
          if (oldIdx !== undefined) {
            deduped[oldIdx] = compositeKey
            indexByKey.delete(incumbentKey)
            indexByKey.set(compositeKey, oldIdx)
          }
          seenPaths.set(dedupKey, compositeKey)
        }
      }
      filtered = deduped
    }

    if (!viewBySource) {
      return filtered.sort((a, b) => a.localeCompare(b))
    }

    const getSource = (compositeKey: string): string => {
      const nullIdx = compositeKey.indexOf('\0')
      const realKey =
        nullIdx >= 0 ? compositeKey.slice(nullIdx + 1) : compositeKey
      const ctx = nullIdx >= 0 ? compositeKey.slice(0, nullIdx) : context
      const pathData = currentData[ctx]?.[realKey] as PathData | undefined
      return pathData?.$source || 'unknown'
    }

    const matchedSourceCounts = new Map<string, number>()
    for (const key of filtered) {
      const src = getSource(key)
      matchedSourceCounts.set(src, (matchedSourceCounts.get(src) || 0) + 1)
    }

    filtered.sort((a, b) => {
      const srcA = getSource(a)
      const srcB = getSource(b)
      const srcCmp = srcA.localeCompare(srcB)
      if (srcCmp !== 0) return srcCmp
      return a.localeCompare(b)
    })

    const bySource = new Map<string, string[]>()
    for (const key of filtered) {
      const src = getSource(key)
      if (!bySource.has(src)) bySource.set(src, [])
      bySource.get(src)!.push(key)
    }

    const result: string[] = []
    for (const src of [...matchedSourceCounts.keys()].sort()) {
      const visibleCount = matchedSourceCounts.get(src)!
      result.push(`${HEADER_PREFIX}${src}\0${visibleCount}`)
      if (!collapsedSources.has(src)) {
        const paths = bySource.get(src)
        if (paths) result.push(...paths)
      }
    }
    return result
  }, [
    context,
    deferredSearch,
    dataVersion,
    viewBySource,
    sourceFilter,
    preferredSourceByPath,
    liveWinnerByPath,
    liveWinnerForCurrentContext,
    skSelf,
    collapsedSources,
    rawSourcesData
  ])

  // Keep the ref in sync with the current memoised path list so the
  // reconnect handler can read it without taking a dep on the memo.
  filteredPathKeysRef.current = filteredPathKeys

  const toggleSourceCollapse = useCallback((sourceRef: string) => {
    setCollapsedSources((prev) => {
      const next = new Set(prev)
      if (next.has(sourceRef)) {
        next.delete(sourceRef)
      } else {
        next.add(sourceRef)
      }
      return next
    })
  }, [])

  const collapseAllSources = useCallback(() => {
    const all = new Set<string>()
    for (const key of filteredPathKeys) {
      if (key.startsWith(HEADER_PREFIX)) {
        const rest = key.slice(HEADER_PREFIX.length)
        const sepIdx = rest.indexOf('\0')
        all.add(sepIdx >= 0 ? rest.slice(0, sepIdx) : rest)
      }
    }
    setCollapsedSources(all)
  }, [filteredPathKeys])

  const expandAllSources = useCallback(() => {
    setCollapsedSources(new Set())
  }, [])

  const handleRawChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = event.target.value === 'raw'
      setRaw(newValue)
      localStorage.setItem(rawStorageKey, String(newValue))
    },
    []
  )

  const handlePause = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newPause = event.target.checked
      setPause(newPause)
      localStorage.setItem(pauseStorageKey, String(newPause))
      if (newPause) {
        granularSubscriptionManager.unsubscribeAll()
        didSubscribeRef.current = false
      } else {
        loadSources()
          .then((sourcesData) => {
            setRawSourcesData(sourcesData)
          })
          .catch((err) => console.warn('Failed to load sources:', err))
        subscribeToDataIfNeeded()
      }
    },
    [loadSources, subscribeToDataIfNeeded]
  )

  const handleViewChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = event.target.value === 'bySource'
      setViewBySource(newValue)
      localStorage.setItem(viewBySourceStorageKey, String(newValue))
    },
    []
  )

  const handleSourcesChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const newValue = event.target.value === 'filtered'
      setSourceFilter(newValue)
      localStorage.setItem(sourceFilterStorageKey, String(newValue))
      if (!pause) {
        granularSubscriptionManager.unsubscribeAll()
        didSubscribeRef.current = false
      }
    },
    [pause]
  )

  return (
    <div className="animated fadeIn">
      <Card>
        <Card.Body>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <Form.Group as={Row} className="mb-2 align-items-center g-2">
              <Col xs="12" md="3">
                <Select<SelectOption, false>
                  value={currentContext}
                  onChange={handleContextChange}
                  options={contextOptions}
                  placeholder="Select a context"
                  isSearchable={true}
                  maxMenuHeight={500}
                  noOptionsMessage={() => 'No contexts available'}
                  components={{ Option: ContextOption }}
                  styles={{
                    menu: (base) => ({ ...base, zIndex: 100 }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected
                        ? base.backgroundColor
                        : 'transparent',
                      ':hover': {
                        backgroundColor: '#deebff'
                      }
                    })
                  }}
                />
              </Col>
              <Col xs="6" md="2">
                <Form.Select
                  value={viewBySource ? 'bySource' : 'paths'}
                  onChange={handleViewChange}
                >
                  <option value="paths">By Path</option>
                  <option value="bySource">By Source</option>
                </Form.Select>
              </Col>
              {viewBySource && (
                <Col xs="auto">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={expandAllSources}
                    style={{ marginRight: '4px' }}
                  >
                    Expand All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    onClick={collapseAllSources}
                  >
                    Collapse All
                  </Button>
                </Col>
              )}
              <Col xs="6" md="2">
                <Form.Select
                  value={sourceFilter ? 'filtered' : 'all'}
                  onChange={handleSourcesChange}
                >
                  <option value="filtered">Priority filtered</option>
                  <option value="all">All sources</option>
                </Form.Select>
              </Col>
              <Col xs="6" md="2">
                <Form.Select
                  value={raw ? 'raw' : 'value'}
                  onChange={handleRawChange}
                >
                  <option value="value">As Value</option>
                  <option value="raw">As Raw</option>
                </Form.Select>
              </Col>
              <Col xs="6" md="auto" className="ms-md-auto">
                <label className="switch switch-text switch-primary">
                  <input
                    type="checkbox"
                    id="databrowser-pause"
                    name="pause"
                    className="switch-input"
                    onChange={handlePause}
                    checked={pause}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </label>{' '}
                <label
                  htmlFor="databrowser-pause"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Pause
                </label>
              </Col>
            </Form.Group>
            {context && context !== 'none' && (
              <Form.Group as={Row}>
                <Col xs="3" md="2">
                  <label htmlFor="databrowser-search">Search</label>
                </Col>
                <Col xs="12" md="12">
                  <Form.Control
                    type="text"
                    id="databrowser-search"
                    name="search"
                    autoComplete="off"
                    placeholder="e.g. pos wind furuno 65017 (path/source/PGN, space = OR)"
                    onChange={handleSearch}
                    value={search}
                  />
                </Col>
              </Form.Group>
            )}

            {context && context !== 'none' && (
              <div
                style={{
                  opacity: isSearchStale ? 0.7 : 1,
                  transition: 'opacity 0.15s'
                }}
              >
                <VirtualizedDataTable
                  path$SourceKeys={filteredPathKeys}
                  context={context}
                  raw={raw}
                  isPaused={pause}
                  showContext={showContext}
                  sourcesData={rawSourcesData}
                  configuredPriorityPaths={configuredPriorityPaths}
                  routedPaths={routedPaths}
                  preferredSourceByPath={
                    !sourceFilter ? liveWinnerForCurrentContext : undefined
                  }
                  fanOutPaths={fanOutPaths}
                  collapsedSources={viewBySource ? collapsedSources : undefined}
                  onToggleSourceCollapse={
                    viewBySource ? toggleSourceCollapse : undefined
                  }
                />
              </div>
            )}
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}

export default DataBrowser
