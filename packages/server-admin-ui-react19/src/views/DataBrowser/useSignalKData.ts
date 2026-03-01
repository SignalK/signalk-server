import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useDeferredValue
} from 'react'
import dayjs from 'dayjs'
import type { PathData, MetaData } from '../../store'
import type { SourcesData } from '../../utils/sourceLabels'
import granularSubscriptionManager from './GranularSubscriptionManager'
import { getPath$SourceKey } from './pathUtils'
import {
  useWebSocket,
  useDeltaMessages,
  getWebSocketService
} from '../../hooks/useWebSocket'
import { useStore, useShallow } from '../../store'

const getSignalkData = () => useStore.getState().signalkData

const TIMESTAMP_FORMAT = 'MM/DD HH:mm:ss'
const TIME_ONLY_FORMAT = 'HH:mm:ss'

const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'

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

interface SourceDevice {
  n2k?: {
    manufacturerCode?: string
    modelId?: string
  }
  type?: string
  [key: string]: unknown
}

interface Sources {
  [key: string]: SourceDevice
}

export type { SelectOption, Sources, DeltaMessage }

export function useSignalKData() {
  const { ws: webSocket, isConnected, skSelf } = useWebSocket()

  const [hasData, setHasData] = useState(false)
  const [pause, setPause] = useState(
    () => localStorage.getItem(pauseStorageKey) === 'true'
  )
  const [context, setContext] = useState(
    () => localStorage.getItem(contextStorageKey) || 'self'
  )
  const [search, setSearch] = useState(
    () => localStorage.getItem(searchStorageKey) || ''
  )
  const [rawSourcesData, setRawSourcesData] = useState<SourcesData | null>(null)

  const deferredSearch = useDeferredValue(search)
  const isSearchStale = search !== deferredSearch

  const dataVersion = useStore((s) => s.dataVersion)
  const contextKeys = useStore(
    useShallow((s) => Object.keys(s.signalkData).sort())
  )

  const updatePath = useStore((s) => s.updatePath)
  const updateMeta = useStore((s) => s.updateMeta)
  const getPathData = useStore((s) => s.getPathData)

  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)
  const isMountedRef = useRef(true)

  const loadSources = useCallback(async (): Promise<{
    raw: SourcesData
  }> => {
    const response = await fetch(`/signalk/v1/api/sources`, {
      credentials: 'include'
    })
    const sourcesData = await response.json()
    const raw = JSON.parse(JSON.stringify(sourcesData)) as SourcesData
    return { raw }
  }, [])

  const handleMessage = useCallback(
    (msg: unknown) => {
      if (pause) return

      const currentSkSelf = getWebSocketService().getSkSelf()
      const deltaMsg = msg as DeltaMessage
      if (!currentSkSelf) return

      if (deltaMsg.context && deltaMsg.updates) {
        const key =
          deltaMsg.context === currentSkSelf ? 'self' : deltaMsg.context

        let isNew = false

        deltaMsg.updates.forEach((update) => {
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
                Object.keys(vp.value as object).forEach((k) => {
                  const pathData: PathData = {
                    path: k,
                    value: (vp.value as Record<string, unknown>)[k],
                    $source: update.$source,
                    pgn: pgn || undefined,
                    sentence: sentence || undefined,
                    timestamp: formattedTimestamp
                  }
                  const wasNew = !getPathData(key, k)
                  updatePath(key, k, pathData)
                  if (wasNew) isNew = true
                })
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
    [pause, context, hasData, updatePath, updateMeta, getPathData]
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
      granularSubscriptionManager.setWebSocket(
        webSocket as unknown as WebSocket
      )
      granularSubscriptionManager.startDiscovery()

      webSocketRef.current = webSocket
      didSubscribeRef.current = true
    }
  }, [pause, webSocket, isConnected, skSelf])

  useEffect(() => {
    isMountedRef.current = true

    loadSources().then(({ raw }) => {
      if (isMountedRef.current) {
        setRawSourcesData(raw)
      }
    })

    return () => {
      isMountedRef.current = false
    }
  }, [loadSources])

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

  const handleContextChange = useCallback((value: string) => {
    granularSubscriptionManager.cancelPending()
    granularSubscriptionManager.startDiscovery()
    setContext(value)
    localStorage.setItem(contextStorageKey, value)
  }, [])

  const handleSearch = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setSearch(value)
      localStorage.setItem(searchStorageKey, value)
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
        loadSources().then(({ raw }) => {
          if (isMountedRef.current) {
            setRawSourcesData(raw)
          }
        })
        subscribeToDataIfNeeded()
      }
    },
    [loadSources, subscribeToDataIfNeeded]
  )

  const reloadSources = useCallback(() => {
    loadSources().then(({ raw }) => {
      if (isMountedRef.current) {
        setRawSourcesData(raw)
      }
    })
  }, [loadSources])

  return {
    context,
    setContext: handleContextChange,
    contextOptions,
    contextKeys,
    search,
    setSearch: handleSearch,
    deferredSearch,
    isSearchStale,
    pause,
    handlePause,
    dataVersion,
    rawSourcesData,
    reloadSources,
    hasData,
    isMountedRef,
    subscribeToDataIfNeeded,
    didSubscribeRef
  }
}
