import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useDeferredValue,
  useTransition
} from 'react'
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
  FormGroup
} from 'reactstrap'
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
  const { ws: webSocket, isConnected } = useWebSocket()

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

  // Subscribe to Zustand signalkData directly - React Compiler tracks this properly
  // Using useShallow to only re-render when contexts change
  const signalkData = useStore(useShallow((s) => s.signalkData))

  // Get Zustand actions for writing data
  const updatePath = useStore((s) => s.updatePath)
  const updateMeta = useStore((s) => s.updateMeta)
  const getPathData = useStore((s) => s.getPathData)

  const didSubscribeRef = useRef(false)
  const webSocketRef = useRef<WebSocket | null>(null)
  const isMountedRef = useRef(true)

  // Load sources data from the API and process NMEA2000 device names
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

      // Get skSelf directly from the service to avoid stale closure issues
      // The service always has the current value from the hello message
      const currentSkSelf = getWebSocketService().getSkSelf()
      const deltaMsg = msg as DeltaMessage

      if (!currentSkSelf) {
        return
      }

      if (deltaMsg.context && deltaMsg.updates) {
        // Use currentSkSelf to determine if this is the self context
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

  // Subscribe to delta messages using the new hook pattern
  useDeltaMessages(handleMessage)

  const subscribeToDataIfNeeded = useCallback(() => {
    // Wait for WebSocket to be actually connected (readyState OPEN)
    // before starting discovery, otherwise the subscription message is dropped
    if (
      !pause &&
      webSocket &&
      isConnected &&
      (webSocket !== webSocketRef.current || didSubscribeRef.current === false)
    ) {
      granularSubscriptionManager.setWebSocket(
        webSocket as unknown as WebSocket
      )
      granularSubscriptionManager.startDiscovery()

      webSocketRef.current = webSocket
      didSubscribeRef.current = true
    }
  }, [pause, webSocket, isConnected])

  // Initial setup effect - load sources on mount
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

  // Compute context options from Zustand state directly
  // React Compiler tracks signalkData as a dependency
  const contextOptions: SelectOption[] = (() => {
    const contexts = Object.keys(signalkData).sort()
    const options: SelectOption[] = []

    if (contexts.includes('self')) {
      const contextData = signalkData['self']?.['name'] as
        | { value?: string }
        | undefined
      const contextName = contextData?.value
      options.push({ value: 'self', label: `${contextName || ''} self` })
    }

    contexts.forEach((key) => {
      if (key !== 'self') {
        const contextData = signalkData[key]?.['name'] as
          | { value?: string }
          | undefined
        const contextName = contextData?.value
        options.push({ value: key, label: `${contextName || ''} ${key}` })
      }
    })

    return options
  })()

  // WebSocket subscription effect - separate from setup to avoid cleanup cycles
  useEffect(() => {
    subscribeToDataIfNeeded()
  }, [subscribeToDataIfNeeded])

  // Cleanup WebSocket subscription only on unmount
  useEffect(() => {
    return () => {
      granularSubscriptionManager.unsubscribeAll()
      didSubscribeRef.current = false
    }
  }, [])

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

  // Direct computation - React 19 Compiler handles memoization
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

  // Compute filtered path keys from Zustand state directly
  const filteredPathKeys: string[] = (() => {
    const contextData = signalkData[context] || {}
    const allKeys = Object.keys(contextData)

    const filtered = allKeys.filter((key) => {
      if (deferredSearch && deferredSearch.length > 0) {
        if (key.toLowerCase().indexOf(deferredSearch.toLowerCase()) === -1) {
          return false
        }
      }

      if (sourceFilterActive && selectedSources.size > 0) {
        const data = contextData[key] as PathData | undefined
        if (data && !selectedSources.has(data.$source || '')) {
          return false
        }
      }

      return true
    })

    return filtered.sort()
  })()

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

  const getUniquePathsForMeta = useCallback(() => {
    const contextData = signalkData[context] || {}
    const allKeys = Object.keys(contextData)

    const filtered = allKeys.filter((key) => {
      if (!search || search.length === 0) {
        return true
      }
      return key.toLowerCase().indexOf(search.toLowerCase()) !== -1
    })

    const paths = filtered.map((key) => {
      const data = contextData[key] as PathData | undefined
      return data?.path || key
    })

    return [...new Set(paths)].sort()
  }, [context, search, signalkData])

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
                <Label className="switch switch-text switch-primary">
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
                <Label className="switch switch-text switch-primary">
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
                <Label className="switch switch-text switch-primary">
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
                />
              </div>
            )}

            {includeMeta && context && context !== 'none' && (
              <VirtualizedMetaTable
                paths={getUniquePathsForMeta()}
                context={context}
              />
            )}
          </Form>
        </CardBody>
      </Card>

      {sources && (
        <Card>
          <CardHeader
            style={{ cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setSourcesExpanded((prev) => !prev)}
          >
            Sources {sourcesExpanded ? '[-]' : '[+]'}
          </CardHeader>
          {sourcesExpanded && (
            <CardBody>
              <JSONTree
                data={sources}
                theme="default"
                invertTheme={true}
                sortObjectKeys
                hideRoot
              />
            </CardBody>
          )}
        </Card>
      )}
    </div>
  )
}

export default DataBrowser
