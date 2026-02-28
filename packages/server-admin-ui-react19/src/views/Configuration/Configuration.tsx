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
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import EmbeddedPluginConfigurationForm from './EmbeddedPluginConfigurationForm'
import { useStore } from '../../store'

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
  bundled?: boolean
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

        const isUnconfigured = !plugin.bundled && configurationRequired

        switch (filter) {
          case 'enabled':
            return !isUnconfigured && plugin.data.enabled
          case 'disabled':
            return !isUnconfigured && !plugin.data.enabled
          case 'unconfigured':
            return isUnconfigured
          default:
            return true
        }
      })
    },
    []
  )

  const getFilteredPlugins = useCallback((): Plugin[] => {
    let filtered = filterPluginsByStatus(plugins, statusFilter)
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

    if (
      rowRect.bottom > containerRect.bottom ||
      rowRect.top < containerRect.top
    ) {
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

    // Keep URL static for best performance
    if (selectedPluginId) {
      localStorage.setItem(openPluginStorageKey, selectedPluginId)
      setSelectedPlugin(plugin)
    } else {
      localStorage.removeItem(openPluginStorageKey)
      setSelectedPlugin(null)
    }
  }, [])

  const handleSearch = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setSearch(value)
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
        if (currentlySelected) {
          selectPlugin(null)
        } else {
          selectPlugin(plugin)
        }
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
        useStore.getState().setPlugins(newPlugins)
        return newPlugins
      })

      setSelectedPlugin((prev) =>
        prev && prev.id === id ? { ...prev, data } : prev
      )

      return true
    },
    []
  )

  useEffect(() => {
    const fetchData = async () => {
      try {
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

        let settings: { interfaces?: { wasm?: boolean } } = {
          interfaces: { wasm: true }
        }
        if (settingsResponse.status === 200) {
          settings = await settingsResponse.json()
        }
        const wasmInterfaceEnabled = settings?.interfaces?.wasm !== false

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
        useStore.getState().setPlugins(fetchedPlugins)
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

  useEffect(() => {
    const unsubscribe = useStore.subscribe(
      (state) => state.plugins,
      (storePlugins) => {
        if (storePlugins.length > 0) {
          setPlugins(storePlugins as Plugin[])
          setSelectedPlugin((prev) => {
            if (!prev) return null
            return (
              (storePlugins.find((p) => p.id === prev.id) as Plugin) || null
            )
          })
        }
      }
    )
    return unsubscribe
  }, [])

  const pluginList = getFilteredPlugins()
  const selectedPluginId = selectedPlugin ? selectedPlugin.id : null

  return (
    <div>
      <Card>
        <Card.Header>
          <FontAwesomeIcon icon={faAlignJustify} />{' '}
          <strong>Plugin Configuration</strong>
        </Card.Header>
        <Card.Body>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
            }}
          >
            <Form.Group as={Row}>
              <Col xs="3" md="1" className={'col-form-label'}>
                <Form.Label htmlFor="search">Search</Form.Label>
              </Col>
              <Col xs="12" md="4">
                <Form.Control
                  type="text"
                  name="search"
                  id="search"
                  onChange={handleSearch}
                  value={search}
                  placeholder="Search plugins..."
                />
              </Col>
              <Col xs="3" md="2" className={'col-form-label'}>
                <Form.Label htmlFor="statusFilter">Filter by Status</Form.Label>
              </Col>
              <Col xs="12" md="3">
                <Form.Select
                  name="statusFilter"
                  id="statusFilter"
                  onChange={handleStatusFilter}
                  value={statusFilter}
                >
                  <option value="all">All Plugins</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                  <option value="unconfigured">Unconfigured</option>
                </Form.Select>
              </Col>
            </Form.Group>
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

                  const isWasmPlugin = plugin.type === 'wasm'
                  const wasmDisabledForPlugin = isWasmPlugin && !wasmEnabled

                  let badgeClass = 'text-bg-secondary'
                  let badgeText = 'Disabled'

                  if (wasmDisabledForPlugin) {
                    badgeClass = 'text-bg-danger'
                    badgeText = 'WASM disabled'
                  } else if (!plugin.bundled && configurationRequired) {
                    badgeClass = 'text-bg-warning'
                    badgeText = 'Unconfigured'
                  } else if (plugin.data.enabled) {
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
        </Card.Body>
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

  // useOptimistic with simple replacement - the updater ignores current state
  // since each optimistic update contains the complete new state
  const [optimisticData, setOptimisticData] = useOptimistic<
    PluginData,
    PluginData
  >(plugin.data, (currentData, newData) => ({ ...currentData, ...newData }))

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
      <Card className="mt-3 plugin-config-card" ref={configCardRef}>
        <Card.Header id="plugin-config-header">
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
                <Form.Label
                  style={labelStyle}
                  className="switch switch-text switch-primary"
                >
                  <input
                    type="checkbox"
                    name="enabled"
                    className="switch-input"
                    onChange={() => handleToggle('enabled')}
                    checked={optimisticData.enabled}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Form.Label>
                <span className="ms-1">Enabled</span>
              </Col>
              <Col lg={4} className={'mt-2 mt-lg-0'}>
                <Form.Label
                  style={labelStyle}
                  className="switch switch-text switch-primary"
                >
                  <input
                    type="checkbox"
                    name="enableLogging"
                    className="switch-input"
                    onChange={() => handleToggle('enableLogging')}
                    checked={optimisticData.enableLogging}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Form.Label>
                <span className="ms-1">Data logging</span>
              </Col>
              <Col lg={4} className={'mt-2 mt-lg-0'}>
                <Form.Label
                  style={labelStyle}
                  className="switch switch-text switch-primary"
                >
                  <input
                    type="checkbox"
                    name="enableDebug"
                    className="switch-input"
                    onChange={() => handleToggle('enableDebug')}
                    checked={optimisticData.enableDebug}
                  />
                  <span className="switch-label" data-on="Yes" data-off="No" />
                  <span className="switch-handle" />
                </Form.Label>
                <span className="ms-1">Enable debug log</span>
              </Col>
            </Row>
          )}
        </Card.Header>
        <Card.Body>
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
              key={plugin.packageName}
              plugin={plugin}
              saveData={saveData}
            />
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
