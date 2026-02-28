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
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import dayjs from 'dayjs'
import VirtualizedDataTable from './VirtualizedDataTable'
import SourceView from './SourceView'
import type { PathData, MetaData } from '../../store'
import type { SourcesData } from '../../utils/sourceLabels'
import granularSubscriptionManager from './GranularSubscriptionManager'
import { getPath$SourceKey } from './pathUtils'
import {
  useWebSocket,
  useDeltaMessages,
  getWebSocketService
} from '../../hooks/useWebSocket'
import {
  useStore,
  useShallow,
  useUnitPrefsLoaded,
  useConfiguredPriorityPaths
} from '../../store'

// Imperative accessor — avoids subscribing the component to every value change.
const getSignalkData = () => useStore.getState().signalkData

const TIMESTAMP_FORMAT = 'MM/DD HH:mm:ss'
const TIME_ONLY_FORMAT = 'HH:mm:ss'

const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const rawStorageKey = 'admin.v1.dataBrowser.v1.raw'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'
const viewBySourceStorageKey = 'admin.v1.dataBrowser.viewBySource'
const sourceFilterStorageKey = 'admin.v1.dataBrowser.sourceFilter'

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

  const deferredSearch = useDeferredValue(search)
  const isSearchStale = search !== deferredSearch

  // dataVersion only increments when new paths appear, not on every value update.
  const dataVersion = useStore((s) => s.dataVersion)

  // Only re-renders when the set of contexts changes (new vessel appears / disappears).
  const contextKeys = useStore(
    useShallow((s) => Object.keys(s.signalkData).sort())
  )

  const updatePath = useStore((s) => s.updatePath)
  const updateMeta = useStore((s) => s.updateMeta)
  const getPathData = useStore((s) => s.getPathData)

  const unitPrefsLoaded = useUnitPrefsLoaded()
  const fetchUnitPreferences = useStore((s) => s.fetchUnitPreferences)
  const configuredPriorityPaths = useConfiguredPriorityPaths()

  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)
  const isMountedRef = useRef(true)

  const loadSources = useCallback(async (): Promise<SourcesData> => {
    const response = await fetch(`/signalk/v1/api/sources`, {
      credentials: 'include'
    })
    return (await response.json()) as SourcesData
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
      granularSubscriptionManager.setSourcePolicy(
        sourceFilter ? 'preferred' : 'all'
      )
      granularSubscriptionManager.startDiscovery()

      webSocketRef.current = webSocket
      didSubscribeRef.current = true
    }
  }, [pause, webSocket, isConnected, skSelf, sourceFilter])

  useEffect(() => {
    isMountedRef.current = true

    loadSources().then((raw) => {
      if (isMountedRef.current) {
        setRawSourcesData(raw)
      }
    })

    if (!unitPrefsLoaded) {
      fetchUnitPreferences()
    }

    return () => {
      isMountedRef.current = false
    }
  }, [loadSources, unitPrefsLoaded, fetchUnitPreferences])

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

      granularSubscriptionManager.cancelPending()
      granularSubscriptionManager.startDiscovery()

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

        filtered.push(context === 'all' ? `${ctx}\0${key}` : key)
      }
    }

    return filtered.sort((a, b) => a.localeCompare(b))
  }, [context, deferredSearch, dataVersion])

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
        loadSources().then((raw) => {
          setRawSourcesData(raw)
        })
        subscribeToDataIfNeeded()
      }
    },
    [loadSources, subscribeToDataIfNeeded]
  )

  const toggleViewBySource = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.checked
      setViewBySource(newValue)
      localStorage.setItem(viewBySourceStorageKey, String(newValue))
    },
    []
  )

  const toggleSourceFilter = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = event.target.checked
      setSourceFilter(newValue)
      localStorage.setItem(sourceFilterStorageKey, String(newValue))
      // Clear stale rows from previous mode and resubscribe
      useStore.getState().clearData()
      granularSubscriptionManager.unsubscribeAll()
      didSubscribeRef.current = false
    },
    []
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
            <Form.Group as={Row}>
              <Col xs="12" md="4">
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
              <Col xs="6" md="2">
                <label className="switch switch-text switch-primary">
                  <input
                    type="checkbox"
                    id="databrowser-by-source"
                    name="bySource"
                    className="switch-input"
                    onChange={toggleViewBySource}
                    checked={viewBySource}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </label>{' '}
                <label
                  htmlFor="databrowser-by-source"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  By Source
                </label>
              </Col>
              <Col xs="6" md="2">
                <label className="switch switch-text switch-primary">
                  <input
                    type="checkbox"
                    id="databrowser-source-filter"
                    name="sourceFilter"
                    className="switch-input"
                    onChange={toggleSourceFilter}
                    checked={sourceFilter}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </label>{' '}
                <label
                  htmlFor="databrowser-source-filter"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Source Priority
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

            {!viewBySource && context && context !== 'none' && (
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
                />
              </div>
            )}

            {viewBySource && context && context !== 'none' && (
              <SourceView
                context={context}
                search={deferredSearch}
                sourcesData={rawSourcesData}
              />
            )}
          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}

export default DataBrowser
