import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useEffectEvent
} from 'react'
import { useSelector } from 'react-redux'
import { JSONTree } from 'react-json-tree'
import Select from 'react-select'
import {
  Card,
  CardHeader,
  CardBody,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  Table
} from 'reactstrap'
import dayjs from 'dayjs'
import Meta from './Meta'
import store, { PathData } from './ValueEmittingStore'
import type { MetaData } from './ValueEmittingStore'
import VirtualizedDataTable from './VirtualizedDataTable'
import granularSubscriptionManager from './GranularSubscriptionManager'
import { getPath$SourceKey } from './pathUtils'

const TIMESTAMP_FORMAT = 'MM/DD HH:mm:ss'
const TIME_ONLY_FORMAT = 'HH:mm:ss'

const metaStorageKey = 'admin.v1.dataBrowser.meta'
const pauseStorageKey = 'admin.v1.dataBrowser.v1.pause'
const rawStorageKey = 'admin.v1.dataBrowser.v1.raw'
const contextStorageKey = 'admin.v1.dataBrowser.context'
const searchStorageKey = 'admin.v1.dataBrowser.search'
const selectedSourcesStorageKey = 'admin.v1.dataBrowser.selectedSources'
const sourceFilterActiveStorageKey = 'admin.v1.dataBrowser.sourceFilterActive'

interface WebSocketWithSK extends WebSocket {
  skSelf?: string
  messageHandler?: ((msg: DeltaMessage) => void) | null
}

interface RootState {
  webSocket: WebSocketWithSK | null
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
  const webSocket = useSelector((state: RootState) => state.webSocket)

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
  const [path$SourceKeys, setPath$SourceKeys] = useState<string[]>([])
  const [sources, setSources] = useState<Sources | null>(null)

  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocketWithSK | null>(null)
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const unsubscribeStoreRef = useRef<(() => void) | null>(null)

  const fetchSources = useCallback(async () => {
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
    setSources(sourcesData)
  }, [])

  // useEffectEvent: always sees latest state without causing effect re-runs
  const onPathSourceKeysUpdate = useEffectEvent(() => {
    const allKeys = store.getPath$SourceKeys(context)

    const filtered = allKeys.filter((key) => {
      // Search filter
      if (search && search.length > 0) {
        if (key.toLowerCase().indexOf(search.toLowerCase()) === -1) {
          return false
        }
      }

      // Source filter
      if (sourceFilterActive && selectedSources.size > 0) {
        const data = store.getPathData(context, key) as PathData | undefined
        if (data && !selectedSources.has(data.$source || '')) {
          return false
        }
      }

      return true
    })

    filtered.sort()
    setPath$SourceKeys(filtered)
  })

  const handleMessage = useCallback(
    (msg: unknown) => {
      if (pause) {
        return
      }

      const deltaMsg = msg as DeltaMessage
      if (deltaMsg.context && deltaMsg.updates) {
        const key =
          deltaMsg.context === webSocketRef.current?.skSelf
            ? 'self'
            : deltaMsg.context

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
                  const wasNew = !store.getPathData(key, k)
                  store.updatePath(key, k, pathData)
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
                const wasNew = !store.getPathData(key, path$SourceKey)
                store.updatePath(key, path$SourceKey, pathData)
                if (wasNew) isNew = true
              }
            })
          }
          if (update.meta) {
            update.meta.forEach((vp) => {
              store.updateMeta(key, vp.path, vp.value as Partial<MetaData>)
            })
          }
        })

        // Update path keys if new paths were added or if this is the selected context
        if (isNew || (context && context === key)) {
          onPathSourceKeysUpdate()
          if (!hasData) {
            setHasData(true)
          }
        }
      }
    },
    [pause, context, hasData]
  )

  const subscribeToDataIfNeeded = useCallback(() => {
    if (
      !pause &&
      webSocket &&
      (webSocket !== webSocketRef.current || didSubscribeRef.current === false)
    ) {
      granularSubscriptionManager.setWebSocket(
        webSocket as unknown as WebSocket
      )
      granularSubscriptionManager.setMessageHandler(handleMessage)
      granularSubscriptionManager.startDiscovery()

      webSocketRef.current = webSocket
      didSubscribeRef.current = true
      webSocket.messageHandler = handleMessage
    }
  }, [pause, webSocket, handleMessage])

  const unsubscribeToData = useCallback(() => {
    granularSubscriptionManager.unsubscribeAll()
    didSubscribeRef.current = false
    if (webSocketRef.current) {
      webSocketRef.current.messageHandler = null
    }
  }, [])

  useEffect(() => {
    fetchSources()
    subscribeToDataIfNeeded()

    // Subscribe to store structure changes
    unsubscribeStoreRef.current = store.subscribeToStructure(() => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
      updateTimeoutRef.current = setTimeout(() => {
        onPathSourceKeysUpdate()
      }, 50)
    })

    return () => {
      unsubscribeToData()
      if (unsubscribeStoreRef.current) {
        unsubscribeStoreRef.current()
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
      granularSubscriptionManager.unsubscribeAll()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    subscribeToDataIfNeeded()
  }, [subscribeToDataIfNeeded])

  const handleContextChange = useCallback(
    (selectedOption: SelectOption | null) => {
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

  const getContextLabel = useCallback((contextKey: string) => {
    const contextData = store.getPathData(contextKey, 'name') as
      | { value?: string }
      | undefined
    const contextName = contextData?.value
    return `${contextName || ''} ${contextKey}`
  }, [])

  const getContextOptions = useCallback((): SelectOption[] => {
    const contexts = store.getContexts().sort()
    const options: SelectOption[] = []

    if (contexts.includes('self')) {
      const selfLabel = getContextLabel('self')
      options.push({ value: 'self', label: selfLabel })
    }

    contexts.forEach((key) => {
      if (key !== 'self') {
        const contextLabel = getContextLabel(key)
        options.push({ value: key, label: contextLabel })
      }
    })

    return options
  }, [getContextLabel])

  const getCurrentContextValue = useCallback((): SelectOption | null => {
    const options = getContextOptions()
    return options.find((option) => option.value === context) || null
  }, [context, getContextOptions])

  const handleSearch = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setSearch(value)
      localStorage.setItem(searchStorageKey, value)
    },
    []
  )

  // Update filtered paths when filters change
  useEffect(() => {
    onPathSourceKeysUpdate()
  }, [context, search, sourceFilterActive, selectedSources])

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
        unsubscribeToData()
        granularSubscriptionManager.unsubscribeAll()
      } else {
        fetchSources()
        subscribeToDataIfNeeded()
      }
    },
    [fetchSources, subscribeToDataIfNeeded, unsubscribeToData]
  )

  const toggleSourceSelection = useCallback((source: string) => {
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

      localStorage.setItem(
        selectedSourcesStorageKey,
        JSON.stringify([...newSelectedSources])
      )

      if (shouldActivateFilter) {
        setSourceFilterActive(true)
        localStorage.setItem(sourceFilterActiveStorageKey, 'true')
      } else if (shouldDeactivateFilter) {
        setSourceFilterActive(false)
        localStorage.setItem(sourceFilterActiveStorageKey, 'false')
      }

      return newSelectedSources
    })
  }, [])

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

  const getUniquePathsForMeta = useCallback(() => {
    const allKeys = store.getPath$SourceKeys(context)

    // Filter by search
    const filtered = allKeys.filter((key) => {
      if (!search || search.length === 0) {
        return true
      }
      return key.toLowerCase().indexOf(search.toLowerCase()) !== -1
    })

    // Extract unique paths (remove source suffix)
    const paths = filtered.map((key) => {
      const data = store.getPathData(context, key) as PathData | undefined
      return data?.path || key
    })

    // Dedupe and sort
    return [...new Set(paths)].sort()
  }, [context, search])

  const contextOptions = getContextOptions()
  const currentContext = getCurrentContextValue()

  return (
    <div className="animated fadeIn">
      <Card>
        <CardBody>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <FormGroup row>
              <Col xs="12" md="4">
                <Select
                  value={currentContext}
                  onChange={handleContextChange}
                  options={contextOptions}
                  placeholder="Select a context"
                  isSearchable={true}
                  isClearable={true}
                  noOptionsMessage={() => 'No contexts available'}
                  styles={{
                    menu: (base) => ({ ...base, zIndex: 100 })
                  }}
                />
              </Col>
              <Col xs="6" md="2">
                <Label
                  className="switch switch-text switch-primary"
                  htmlFor="databrowser-meta"
                >
                  <Input
                    type="checkbox"
                    id="databrowser-meta"
                    name="meta"
                    className="switch-input"
                    onChange={toggleMeta}
                    checked={includeMeta}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>{' '}
                <Label
                  htmlFor="databrowser-meta"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Meta data
                </Label>
              </Col>
              <Col xs="6" md="2">
                <Label
                  className="switch switch-text switch-primary"
                  htmlFor="databrowser-pause"
                >
                  <Input
                    type="checkbox"
                    id="databrowser-pause"
                    name="pause"
                    className="switch-input"
                    onChange={handlePause}
                    checked={pause}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>{' '}
                <Label
                  htmlFor="databrowser-pause"
                  style={{ cursor: 'pointer' }}
                >
                  Pause
                </Label>
              </Col>
              <Col xs="6" md="2">
                <Label
                  className="switch switch-text switch-primary"
                  htmlFor="databrowser-raw"
                >
                  <Input
                    type="checkbox"
                    id="databrowser-raw"
                    name="raw"
                    className="switch-input"
                    onChange={toggleRaw}
                    checked={raw}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>{' '}
                <Label
                  htmlFor="databrowser-raw"
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                >
                  Raw Values
                </Label>
              </Col>
            </FormGroup>
            {context && context !== 'none' && (
              <FormGroup row>
                <Col xs="3" md="2">
                  <Label htmlFor="databrowser-search">Search</Label>
                </Col>
                <Col xs="12" md="12">
                  <Input
                    type="text"
                    id="databrowser-search"
                    name="search"
                    autoComplete="off"
                    onChange={handleSearch}
                    value={search}
                  />
                </Col>
              </FormGroup>
            )}

            {/* Data Values View - Virtualized */}
            {!includeMeta && context && context !== 'none' && (
              <VirtualizedDataTable
                path$SourceKeys={path$SourceKeys}
                context={context}
                raw={raw}
                isPaused={pause}
                onToggleSource={toggleSourceSelection}
                selectedSources={selectedSources}
                onToggleSourceFilter={toggleSourceFilter}
                sourceFilterActive={sourceFilterActive}
              />
            )}

            {/* Meta View - Keep original table for now */}
            {includeMeta && context && context !== 'none' && (
              <Table responsive bordered striped size="sm">
                <thead>
                  <tr>
                    <th>Path</th>
                    <th>Meta</th>
                  </tr>
                </thead>
                <tbody>
                  {getUniquePathsForMeta().map((path) => {
                    const meta = store.getMeta(context, path) || {}
                    return (
                      <tr key={path}>
                        <td>{path}</td>
                        <td>
                          {!path.startsWith('notifications') && (
                            <Meta meta={meta} path={path} />
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            )}
          </Form>
        </CardBody>
      </Card>

      {sources && (
        <Card>
          <CardHeader>Sources</CardHeader>
          <CardBody>
            <JSONTree
              data={sources}
              theme="default"
              invertTheme={true}
              sortObjectKeys
              hideRoot
            />
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default DataBrowser
