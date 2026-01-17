import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useOptimistic,
  useTransition,
  ChangeEvent,
  MouseEvent,
  FormEvent
} from 'react'
import { useParams } from 'react-router-dom'
import PluginConfigurationForm from './../ServerConfig/PluginConfigurationForm'
import {
  Card,
  CardBody,
  CardHeader,
  Row,
  Col,
  Input,
  Label,
  Form,
  FormGroup,
  Table
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import EmbeddedPluginConfigurationForm from './EmbeddedPluginConfigurationForm'

interface PluginSchema {
  properties?: Record<string, unknown>
  [key: string]: unknown
}

interface PluginData {
  enabled?: boolean
  enableLogging?: boolean
  enableDebug?: boolean
  configuration?: Record<string, unknown>
  [key: string]: unknown
}

interface Plugin {
  id: string
  name: string
  packageName: string
  description?: string
  type?: string
  keywords?: string[]
  schema: PluginSchema
  uiSchema?: Record<string, unknown>
  statusMessage?: string
  data: PluginData
  [key: string]: unknown
}

const searchStorageKey = 'admin.v1.plugins.search'
const openPluginStorageKey = 'admin.v1.plugins.openPlugin'
const statusFilterStorageKey = 'admin.v1.plugins.statusFilter'

const isConfigurator = (pluginData: Plugin): boolean =>
  (pluginData.keywords || []).includes('signalk-plugin-configurator')

export default function PluginConfigurationList() {
  const params = useParams<{ pluginid?: string }>()

  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [search, setSearch] = useState(
    () => localStorage.getItem(searchStorageKey) || ''
  )
  const [statusFilter, setStatusFilter] = useState(
    () => localStorage.getItem(statusFilterStorageKey) || 'all'
  )
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null)
  const [wasmEnabled, setWasmEnabled] = useState(true)

  // React 19: useTransition for non-blocking filter updates
  const [isFiltering, startFilterTransition] = useTransition()

  const tableContainerRef = useRef<HTMLDivElement>(null)

  const searchPlugins = useCallback(
    (pluginList: Plugin[], searchString: string): Plugin[] => {
      const lowerCase = searchString.toLowerCase()
      return pluginList.filter((plugin) => {
        return (
          plugin.id.toLowerCase().includes(lowerCase) ||
          plugin.packageName.toLowerCase().includes(lowerCase) ||
          (plugin.description &&
            plugin.description.toLowerCase().includes(lowerCase)) ||
          plugin.name.toLowerCase().includes(lowerCase)
        )
      })
    },
    []
  )

  const filterPluginsByStatus = useCallback(
    (pluginList: Plugin[], filter: string): Plugin[] => {
      if (filter === 'all') {
        return pluginList
      }

      return pluginList.filter((plugin) => {
        const configurationRequired =
          plugin.schema &&
          plugin.schema.properties &&
          Object.keys(plugin.schema?.properties).length !== 0 &&
          (plugin.data.configuration === null ||
            plugin.data.configuration === undefined)

        switch (filter) {
          case 'enabled':
            return !configurationRequired && plugin.data.enabled
          case 'disabled':
            return configurationRequired || !plugin.data.enabled
          default:
            return true
        }
      })
    },
    []
  )

  const getFilteredPlugins = useCallback((): Plugin[] => {
    let filtered = plugins

    // Apply status filter
    filtered = filterPluginsByStatus(filtered, statusFilter)

    // Apply search filter
    if (search.length > 0) {
      filtered = searchPlugins(filtered, search)
    }

    return filtered
  }, [plugins, statusFilter, search, filterPluginsByStatus, searchPlugins])

  const scrollToSelectedPlugin = useCallback((selectedPluginId: string) => {
    if (!tableContainerRef.current || !selectedPluginId) return

    const selectedRow = tableContainerRef.current.querySelector(
      `[data-plugin-id="${selectedPluginId}"]`
    ) as HTMLElement | null
    if (!selectedRow) return

    const containerRect = tableContainerRef.current.getBoundingClientRect()
    const rowRect = selectedRow.getBoundingClientRect()

    // Check if the row is outside the visible area
    if (
      rowRect.bottom > containerRect.bottom ||
      rowRect.top < containerRect.top
    ) {
      // Calculate the scroll position to center the selected row
      const rowOffsetTop = selectedRow.offsetTop
      const containerHeight = tableContainerRef.current.clientHeight
      const rowHeight = selectedRow.clientHeight

      const targetScrollTop = rowOffsetTop - containerHeight / 2 + rowHeight / 2

      tableContainerRef.current.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      })
    }
  }, [])

  const selectPlugin = useCallback((plugin: Plugin | null) => {
    const selectedPluginId = plugin ? plugin.id : null

    // Update localStorage and state only - keep URL static for best performance
    if (selectedPluginId) {
      localStorage.setItem(openPluginStorageKey, selectedPluginId)
      setSelectedPlugin(plugin)
    } else {
      localStorage.removeItem(openPluginStorageKey)
      setSelectedPlugin(null)
    }
  }, [])

  // React 19: useTransition keeps UI responsive during search
  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    // Immediate update for input field
    setSearch(value)
    // Deferred update for filtering (non-blocking)
    startFilterTransition(() => {
      localStorage.setItem(searchStorageKey, value)
    })
  }, [])

  const handleStatusFilter = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      startFilterTransition(() => {
        setStatusFilter(value)
        localStorage.setItem(statusFilterStorageKey, value)
      })
    },
    []
  )

  const handlePluginClick = useCallback(
    (event: MouseEvent<HTMLTableRowElement>) => {
      const pluginId = event.currentTarget.getAttribute('data-plugin-id')
      const plugin = plugins.find((p) => p.id === pluginId)

      if (plugin) {
        const currentlySelected =
          selectedPlugin && selectedPlugin.id === plugin.id
        selectPlugin(currentlySelected ? null : plugin)
      }
    },
    [plugins, selectedPlugin, selectPlugin]
  )

  const saveData = useCallback(
    async (id: string, data: PluginData): Promise<boolean> => {
      const response = await fetch(
        `${window.serverRoutesPrefix}/plugins/${id}/config`,
        {
          method: 'POST',
          body: JSON.stringify(data),
          headers: new Headers({ 'Content-Type': 'application/json' }),
          credentials: 'same-origin'
        }
      )

      if (response.status !== 200) {
        console.error(response)
        alert('Saving plugin settings failed')
        throw new Error('Save failed')
      }

      setPlugins((prevPlugins) => {
        const newPlugins = [...prevPlugins]
        const pluginIndex = newPlugins.findIndex((plugin) => plugin.id === id)
        if (pluginIndex !== -1) {
          newPlugins[pluginIndex] = { ...newPlugins[pluginIndex], data }
        }
        return newPlugins
      })

      // Update selected plugin if it's the one being saved
      setSelectedPlugin((prev) =>
        prev && prev.id === id ? { ...prev, data } : prev
      )

      return true // Success
    },
    []
  )

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch both plugins and settings in parallel
        const [pluginsResponse, settingsResponse] = await Promise.all([
          fetch(`${window.serverRoutesPrefix}/plugins`, {
            credentials: 'same-origin'
          }),
          fetch(`${window.serverRoutesPrefix}/settings`, {
            credentials: 'same-origin'
          })
        ])

        if (pluginsResponse.status !== 200) {
          throw new Error('/plugins request failed:' + pluginsResponse.status)
        }

        const fetchedPlugins: Plugin[] = await pluginsResponse.json()

        // Settings fetch - use defaults if failed
        let settings: { interfaces?: { wasm?: boolean } } = {
          interfaces: { wasm: true }
        }
        if (settingsResponse.status === 200) {
          settings = await settingsResponse.json()
        }

        // Check if WASM interface is enabled (default true if not specified)
        const wasmInterfaceEnabled = settings?.interfaces?.wasm !== false

        // Set initial selected plugin from URL or localStorage
        const currentPluginId = params.pluginid
        const lastOpenPluginId = localStorage.getItem(openPluginStorageKey)
        let initialSelectedPlugin: Plugin | null = null

        if (currentPluginId && currentPluginId !== '-') {
          initialSelectedPlugin =
            fetchedPlugins.find((plugin) => plugin.id === currentPluginId) ||
            null
        } else if (lastOpenPluginId) {
          initialSelectedPlugin =
            fetchedPlugins.find((plugin) => plugin.id === lastOpenPluginId) ||
            null
        }

        setPlugins(fetchedPlugins)
        setSelectedPlugin(initialSelectedPlugin)
        setWasmEnabled(wasmInterfaceEnabled)

        // Scroll to the initially selected plugin if one exists (from URL/bookmark)
        if (initialSelectedPlugin) {
          requestAnimationFrame(() => {
            scrollToSelectedPlugin(initialSelectedPlugin!.id)
          })
        }
      } catch (error) {
        console.error(error)
        alert('Could not fetch plugins list')
      }
    }

    fetchData()
  }, [params.pluginid, scrollToSelectedPlugin])

  const pluginList = getFilteredPlugins()
  const selectedPluginId = selectedPlugin ? selectedPlugin.id : null

  return (
    <div>
      <Card>
        <CardHeader>
          <FontAwesomeIcon icon={faAlignJustify} />{' '}
          <strong>Plugin Configuration</strong>
        </CardHeader>
        <CardBody>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
            }}
          >
            <FormGroup row>
              <Col xs="3" md="1" className={'col-form-label'}>
                <Label htmlFor="search">Search</Label>
              </Col>
              <Col xs="12" md="4">
                <Input
                  type="text"
                  name="search"
                  id="search"
                  onChange={handleSearch}
                  value={search}
                  placeholder="Search plugins..."
                />
              </Col>
              <Col xs="3" md="2" className={'col-form-label'}>
                <Label htmlFor="statusFilter">Filter by Status</Label>
              </Col>
              <Col xs="12" md="3">
                <Input
                  type="select"
                  name="statusFilter"
                  id="statusFilter"
                  onChange={handleStatusFilter}
                  value={statusFilter}
                >
                  <option value="all">All Plugins</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </Input>
              </Col>
            </FormGroup>
          </Form>

          <div
            ref={tableContainerRef}
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              border: '1px solid #dee2e6',
              opacity: isFiltering ? 0.7 : 1,
              transition: 'opacity 0.2s'
            }}
          >
            <Table responsive bordered striped size="sm" hover className="mb-0">
              <thead
                style={{
                  position: 'sticky',
                  top: 0,
                  backgroundColor: '#f8f9fa',
                  zIndex: 1
                }}
              >
                <tr>
                  <th style={{ width: '30%' }}>Plugin Name</th>
                  <th style={{ width: '15%' }}>Status</th>
                  <th style={{ width: '55%' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {pluginList.map((plugin) => {
                  const isSelected = selectedPluginId === plugin.id
                  const configurationRequired =
                    plugin.schema &&
                    plugin.schema.properties &&
                    Object.keys(plugin.schema?.properties).length !== 0 &&
                    (plugin.data.configuration === null ||
                      plugin.data.configuration === undefined)

                  // Check if this is a WASM plugin with WASM interface disabled
                  const isWasmPlugin = plugin.type === 'wasm'
                  const wasmDisabledForPlugin = isWasmPlugin && !wasmEnabled

                  // Determine badge class and text (Bootstrap 5 uses text-bg-* classes)
                  let badgeClass = 'text-bg-secondary'
                  let badgeText = 'Disabled'

                  if (wasmDisabledForPlugin) {
                    badgeClass = 'text-bg-danger'
                    badgeText = 'WASM disabled'
                  } else if (plugin.data.enabled && !configurationRequired) {
                    badgeClass = 'text-bg-success'
                    badgeText = 'Enabled'
                  }

                  return (
                    <tr
                      key={plugin.id}
                      data-plugin-id={plugin.id}
                      onClick={handlePluginClick}
                      style={{ cursor: 'pointer' }}
                      className={isSelected ? 'table-active' : ''}
                    >
                      <td>
                        <strong>{plugin.name}</strong>
                      </td>
                      <td>
                        <div className="d-flex align-items-center justify-content-between">
                          <div className={`badge ${badgeClass}`}>
                            {badgeText}
                          </div>
                          <FontAwesomeIcon
                            icon={faGear}
                            className="text-muted"
                            style={{ fontSize: '16px' }}
                            title="Click to configure"
                          />
                        </div>
                      </td>
                      <td>
                        <small>
                          {plugin.description || 'No description available'}
                        </small>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        </CardBody>
      </Card>

      {selectedPlugin && (
        <PluginConfigCard
          plugin={selectedPlugin}
          isConfigurator={isConfigurator(selectedPlugin)}
          saveData={(data: PluginData) => {
            // Only auto-enable on first-ever configuration save
            // Check if plugin was never configured before (no enabled state set)
            // This allows plugins that are already enabled/disabled to be toggled
            if (
              selectedPlugin.data.enabled === undefined &&
              data.enabled === undefined
            ) {
              data.enabled = true
            }
            return saveData(selectedPlugin.id, data)
          }}
        />
      )}
    </div>
  )
}

interface PluginConfigCardProps {
  plugin: Plugin
  isConfigurator: boolean
  saveData: (data: PluginData) => Promise<boolean>
}

function PluginConfigCard({
  plugin,
  isConfigurator,
  saveData
}: PluginConfigCardProps) {
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const configCardRef = useRef<HTMLDivElement>(null)

  // React 19: useOptimistic for instant toggle feedback
  // Shows the new state immediately while the server request is in flight
  const [optimisticData, setOptimisticData] = useOptimistic(
    plugin.data,
    (_currentData: PluginData, newData: PluginData) => newData
  )

  const showSuccessMessage = useCallback(() => {
    setShowSaveSuccess(true)
    setTimeout(() => {
      setShowSaveSuccess(false)
    }, 3000) // Hide after 3 seconds
  }, [])

  const handleToggle = useCallback(
    (field: 'enabled' | 'enableLogging' | 'enableDebug') => {
      const newData = {
        ...plugin.data,
        [field]: !plugin.data[field]
      }
      setOptimisticData(newData)
      saveData(newData).catch(() => {})
    },
    [plugin.data, saveData, setOptimisticData]
  )

  const labelStyle = { marginLeft: '10px', marginBottom: '0px' }
  const { schema } = plugin
  const configurationRequired =
    schema &&
    schema.properties &&
    Object.keys(schema?.properties).length !== 0 &&
    (plugin.data.configuration === null ||
      plugin.data.configuration === undefined)

  return (
    <div>
      {showSaveSuccess && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            maxWidth: '300px'
          }}
        >
          <div
            className="alert alert-success mb-0"
            role="alert"
            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
          >
            <FontAwesomeIcon icon={faCheck} /> Configuration saved successfully!
          </div>
        </div>
      )}
      <Card className="mt-3 plugin-config-card" innerRef={configCardRef}>
        <CardHeader id="plugin-config-header">
          <Row className="mb-2">
            <Col className={'align-self-center'}>
              <h5 className="mb-0">
                <FontAwesomeIcon
                  icon={faGear}
                  style={{ marginRight: '10px' }}
                />
                Configure: {plugin.name}
              </h5>
              <small className="text-muted">{plugin.packageName}</small>
            </Col>
          </Row>
          {!configurationRequired && (
            <Row>
              <Col lg={4} className={'mt-2 mt-lg-0'}>
                <Label
                  style={labelStyle}
                  className="switch switch-text switch-primary"
                >
                  <Input
                    type="checkbox"
                    name="enabled"
                    className="switch-input"
                    onChange={() => handleToggle('enabled')}
                    checked={optimisticData.enabled}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>
                <span className="ms-1">Enabled</span>
              </Col>
              <Col lg={4} className={'mt-2 mt-lg-0'}>
                <Label
                  style={labelStyle}
                  className="switch switch-text switch-primary"
                >
                  <Input
                    type="checkbox"
                    name="enableLogging"
                    className="switch-input"
                    onChange={() => handleToggle('enableLogging')}
                    checked={optimisticData.enableLogging}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>
                <span className="ms-1">Data logging</span>
              </Col>
              <Col lg={4} className={'mt-2 mt-lg-0'}>
                <Label
                  style={labelStyle}
                  className="switch switch-text switch-primary"
                >
                  <Input
                    type="checkbox"
                    name="enableDebug"
                    className="switch-input"
                    onChange={() => handleToggle('enableDebug')}
                    checked={optimisticData.enableDebug}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Label>
                <span className="ms-1">Enable debug log</span>
              </Col>
            </Row>
          )}
        </CardHeader>
        <CardBody>
          {!isConfigurator && (
            <div>
              <PluginConfigurationForm
                plugin={plugin}
                onSubmit={(data: PluginData) => {
                  saveData(data)
                    .then(() => {
                      showSuccessMessage()
                    })
                    .catch(() => {
                      // Error is already handled in saveData with alert
                    })
                }}
              />
              {/* Sticky submit button */}
              <div
                style={{
                  position: 'fixed',
                  bottom: '20px',
                  right: '20px',
                  zIndex: 1000,
                  backgroundColor: '#fff',
                  padding: '10px',
                  borderRadius: '5px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                  border: '1px solid #dee2e6'
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    // Find and trigger the form's submit button
                    const formSubmitBtn = document.querySelector(
                      '.plugin-config-card form button[type="submit"]'
                    ) as HTMLButtonElement | null
                    if (formSubmitBtn) {
                      formSubmitBtn.click()
                    }
                  }}
                  style={{ minWidth: '140px' }}
                >
                  <FontAwesomeIcon
                    icon={faFloppyDisk}
                    style={{ marginRight: '8px' }}
                  />
                  Save Configuration
                </button>
              </div>
            </div>
          )}
          {isConfigurator && (
            <EmbeddedPluginConfigurationForm
              plugin={plugin}
              saveData={saveData}
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
