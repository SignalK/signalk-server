import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useDeferredValue,
  useTransition
} from 'react'
import { JSONTree } from 'react-json-tree'
import Select, {
  components,
  type OptionProps,
  type SingleValue
} from 'react-select'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import dayjs from 'dayjs'
import VirtualizedMetaTable from './VirtualizedMetaTable'
import VirtualizedDataTable from './VirtualizedDataTable'
import type { PathData, MetaData } from '../../store'
import granularSubscriptionManager from './GranularSubscriptionManager'
import { getPath$SourceKey } from './pathUtils'
import {
  useWebSocket,
  useDeltaMessages,
  getWebSocketService
} from '../../hooks/useWebSocket'
import { useStore, useShallow } from '../../store'

// Imperative accessor — avoids subscribing the component to every value change.
const getSignalkData = () => useStore.getState().signalkData

const TIMESTAMP_FORMAT = 'MM/DD HH:mm:ss'
const TIME_ONLY_FORMAT = 'HH:mm:ss'

const metaStorageKey = 'admin.v1.dataBrowser.meta'
const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const rawStorageKey = 'admin.v1.dataBrowser.v1.raw'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'
const selectedSourcesStorageKey = 'admin.v1.dataBrowser.selectedSources'
const sourceFilterActiveStorageKey = 'admin.v1.dataBrowser.sourceFilterActive'

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

const DataBrowser: React.FC = () => {
  const { ws: webSocket, isConnected, skSelf } = useWebSocket()

  const [hasData, setHasData] = useState(false)
  const [pause, setPause] = useState(
    () => localStorage.getItem(pauseStorageKey) === 'true'
  )
  const [includeMeta, setIncludeMeta] = useState(
    () => localStorage.getItem(metaStorageKey) === 'true'
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
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    () =>
      new Set(
        JSON.parse(localStorage.getItem(selectedSourcesStorageKey) || '[]')
      )
  )
  const [sourceFilterActive, setSourceFilterActive] = useState(
    () => localStorage.getItem(sourceFilterActiveStorageKey) === 'true'
  )
  const [sources, setSources] = useState<Sources | null>(null)
  const [sourcesExpanded, setSourcesExpanded] = useState(false)

  const deferredSearch = useDeferredValue(search)
  const isSearchStale = search !== deferredSearch
  const [, startTransition] = useTransition()

  // dataVersion only increments when new paths appear, not on every value update.
  const dataVersion = useStore((s) => s.dataVersion)

  // Only re-renders when the set of contexts changes (new vessel appears / disappears).
  const contextKeys = useStore(
    useShallow((s) => Object.keys(s.signalkData).sort())
  )

  const updatePath = useStore((s) => s.updatePath)
  const updateMeta = useStore((s) => s.updateMeta)
  const getPathData = useStore((s) => s.getPathData)

  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)
  const isMountedRef = useRef(true)

  const loadSources = useCallback(async (): Promise<Sources> => {
    const response = await fetch(`/signalk/v1/api/sources`, {
      credentials: 'include'
    })
    const sourcesData: Sources = await response.json()

    Object.values(sourcesData).forEach((source) => {
      if (source.type === 'NMEA2000') {
        Object.keys(source).forEach((key) => {
          const device = source[key] as SourceDevice
          if (device && device.n2k && device.n2k.modelId) {
            sourcesData[
              `${device.n2k.manufacturerCode || ''} ${device.n2k.modelId} (${key})`
            ] = device
            delete sourcesData[key]
          }
        })
      }
    })
    return sourcesData
  }, [])

  const handleMessage = useCallback(
    (msg: unknown) => {
      if (pause) {
        return
      }

      // Read from service directly to avoid stale closure
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
    // Wait for hello message (skSelf) before discovery — handleMessage needs
    // the vessel's self identity to map contexts correctly.
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

    loadSources().then((data) => {
      if (isMountedRef.current) {
        setSources(data)
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

  // Re-subscribe when switching back from meta view — the subscription manager
  // may have gone idle while the data table was unmounted.
  const prevIncludeMetaRef = useRef(includeMeta)
  useEffect(() => {
    if (prevIncludeMetaRef.current && !includeMeta) {
      const state = granularSubscriptionManager.getState()
      if (state.state === 'idle') {
        didSubscribeRef.current = false
        subscribeToDataIfNeeded()
      }
    }
    prevIncludeMetaRef.current = includeMeta
  }, [includeMeta, subscribeToDataIfNeeded])

  useEffect(() => {
    return () => {
      granularSubscriptionManager.unsubscribeAll()
      didSubscribeRef.current = false
    }
  }, [])

  const handleContextChange = useCallback(
    (selectedOption: SingleValue<SelectOption>) => {
      const value = selectedOption ? selectedOption.value : 'none'

      localStorage.setItem(selectedSourcesStorageKey, JSON.stringify([]))
      localStorage.setItem(sourceFilterActiveStorageKey, 'false')

      granularSubscriptionManager.cancelPending()
      granularSubscriptionManager.startDiscovery()

      setContext(value)
      setSelectedSources(new Set())
      setSourceFilterActive(false)

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

  const filteredPathKeys: string[] = useMemo(() => {
    const currentData = dataVersion >= 0 ? getSignalkData() : {}
    const contexts = context === 'all' ? Object.keys(currentData) : [context]

    const filtered: string[] = []

    for (const ctx of contexts) {
      const contextData = currentData[ctx] || {}
      for (const key of Object.keys(contextData)) {
        if (deferredSearch && deferredSearch.length > 0) {
          if (key.toLowerCase().indexOf(deferredSearch.toLowerCase()) === -1) {
            continue
          }
        }

        if (sourceFilterActive && selectedSources.size > 0) {
          const data = contextData[key] as PathData | undefined
          if (data && !selectedSources.has(data.$source || '')) {
            continue
          }
        }

        filtered.push(context === 'all' ? `${ctx}\0${key}` : key)
      }
    }

    return filtered.sort()
  }, [
    context,
    deferredSearch,
    sourceFilterActive,
    selectedSources,
    dataVersion
  ])

  const toggleMeta = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setIncludeMeta(event.target.checked)
      localStorage.setItem(metaStorageKey, String(event.target.checked))
    },
    []
  )

  const toggleRaw = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRaw(event.target.checked)
      localStorage.setItem(rawStorageKey, String(event.target.checked))
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
        loadSources().then(setSources)
        subscribeToDataIfNeeded()
      }
    },
    [loadSources, subscribeToDataIfNeeded]
  )

  const toggleSourceSelection = useCallback(
    (source: string) => {
      setSelectedSources((prev) => {
        const newSelectedSources = new Set(prev)
        const wasEmpty = newSelectedSources.size === 0

        if (newSelectedSources.has(source)) {
          newSelectedSources.delete(source)
        } else {
          newSelectedSources.add(source)
        }

        const newSize = newSelectedSources.size
        const shouldActivateFilter = wasEmpty && newSize === 1
        const shouldDeactivateFilter = newSelectedSources.size === 0

        startTransition(() => {
          localStorage.setItem(
            selectedSourcesStorageKey,
            JSON.stringify([...newSelectedSources])
          )

          if (shouldActivateFilter) {
            localStorage.setItem(sourceFilterActiveStorageKey, 'true')
          } else if (shouldDeactivateFilter) {
            localStorage.setItem(sourceFilterActiveStorageKey, 'false')
          }
        })

        if (shouldActivateFilter) {
          setSourceFilterActive(true)
        } else if (shouldDeactivateFilter) {
          setSourceFilterActive(false)
        }

        return newSelectedSources
      })
    },
    [startTransition]
  )

  const toggleSourceFilter = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newSourceFilterActive = event.target.checked
      localStorage.setItem(
        sourceFilterActiveStorageKey,
        String(newSourceFilterActive)
      )

      setSourceFilterActive(newSourceFilterActive)
    },
    []
  )

  const uniquePathsForMeta = useMemo(() => {
    const currentData = dataVersion >= 0 ? getSignalkData() : {}
    const contexts = context === 'all' ? Object.keys(currentData) : [context]
    const paths: string[] = []
    const seen = new Set<string>()

    for (const ctx of contexts) {
      const contextData = currentData[ctx] || {}
      for (const key of Object.keys(contextData)) {
        if (search && search.length > 0) {
          if (key.toLowerCase().indexOf(search.toLowerCase()) === -1) {
            continue
          }
        }
        const data = contextData[key] as PathData | undefined
        const path = data?.path || key
        const dedupKey = context === 'all' ? `${ctx}\0${path}` : path
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey)
          paths.push(dedupKey)
        }
      }
    }

    return paths.sort()
  }, [context, search, dataVersion])

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
            <Form.Group as={Row}>
              <Col xs="12" md="4">
                <Select<SelectOption, false>
                  value={currentContext}
                  onChange={handleContextChange}
                  options={contextOptions}
                  placeholder="Select a context"
                  isSearchable={true}
                  isClearable={true}
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
                <label className="switch switch-text switch-primary">
                  <input
                    type="checkbox"
                    id="databrowser-meta"
                    name="meta"
                    className="switch-input"
                    onChange={toggleMeta}
                    checked={includeMeta}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </label>{' '}
                <label
                  htmlFor="databrowser-meta"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Meta data
                </label>
              </Col>
              <Col xs="6" md="2">
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
                  style={{ cursor: 'pointer' }}
                >
                  Pause
                </label>
              </Col>
              <Col xs="6" md="2">
                <label className="switch switch-text switch-primary">
                  <input
                    type="checkbox"
                    id="databrowser-raw"
                    name="raw"
                    className="switch-input"
                    onChange={toggleRaw}
                    checked={raw}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </label>{' '}
                <label
                  htmlFor="databrowser-raw"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Raw Values
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
                    onChange={handleSearch}
                    value={search}
                  />
                </Col>
              </Form.Group>
            )}

            {!includeMeta && context && context !== 'none' && (
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
                  onToggleSource={toggleSourceSelection}
                  selectedSources={selectedSources}
                  onToggleSourceFilter={toggleSourceFilter}
                  sourceFilterActive={sourceFilterActive}
                  showContext={showContext}
                />
              </div>
            )}

            {includeMeta && context && context !== 'none' && (
              <VirtualizedMetaTable
                paths={uniquePathsForMeta}
                context={context}
                showContext={context === 'all'}
              />
            )}
          </Form>
        </Card.Body>
      </Card>

      {sources && (
        <Card>
          <Card.Header
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setSourcesExpanded((prev) => !prev)}
          >
            Sources {sourcesExpanded ? '[-]' : '[+]'}
          </Card.Header>
          {sourcesExpanded && (
            <Card.Body>
              <JSONTree
                data={sources}
                theme="default"
                invertTheme={true}
                sortObjectKeys
                hideRoot
              />
            </Card.Body>
          )}
        </Card>
      )}
    </div>
  )
}

export default DataBrowser
