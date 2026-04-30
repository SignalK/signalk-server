import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { faCirclePlus } from '@fortawesome/free-solid-svg-icons/faCirclePlus'
import { faCircleDot } from '@fortawesome/free-regular-svg-icons/faCircleDot'
import { useStore } from '../../store'

import BasicProvider from './BasicProvider'
import set from 'lodash.set'

interface Provider {
  id: string
  type: string
  enabled: boolean
  logging: boolean
  editable: boolean
  options: Record<string, unknown>
  json?: string
  isNew?: boolean
  wasDiscovered?: boolean
  originalId?: string
  [key: string]: unknown
}

const ProvidersConfiguration: React.FC = () => {
  const params = useParams<{ providerId?: string }>()
  const navigate = useNavigate()
  const discoveredProviders = useStore(
    (state) => state.discoveredProviders
  ) as Provider[]

  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null
  )
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)

  const selectedProviderRef = useRef<HTMLDivElement>(null)

  interface ProvidersData {
    providers: Provider[]
    selectedProvider: Provider | null
    selectedIndex: number
  }

  const loadProviders = useCallback(async (): Promise<ProvidersData> => {
    const response = await fetch(`${window.serverRoutesPrefix}/providers`, {
      credentials: 'include'
    })
    const data: Provider[] = await response.json()

    let foundProvider: Provider | undefined
    let foundIndex: number | undefined

    if (params.providerId) {
      foundProvider = data.find((provider) => provider.id === params.providerId)
      foundIndex = data.findIndex(
        (provider) => provider.id === params.providerId
      )
    }

    if (foundProvider) {
      foundProvider.originalId = foundProvider.id
    }

    return {
      providers: data,
      selectedProvider: foundProvider ? structuredClone(foundProvider) : null,
      selectedIndex: foundIndex ?? -1
    }
  }, [params.providerId])

  const runDiscovery = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/runDiscovery`, {
      method: 'PUT',
      credentials: 'include'
    })
  }, [])

  useEffect(() => {
    loadProviders().then((data) => {
      setProviders(data.providers)
      setSelectedProvider(data.selectedProvider)
      setSelectedIndex(data.selectedIndex)
    })
    runDiscovery()
  }, [loadProviders, runDiscovery])

  const handleProviderChange = useCallback(
    (
      event:
        | React.ChangeEvent<HTMLInputElement>
        | {
            target: {
              name: string
              value: unknown
              type?: string
              checked?: boolean
            }
          },
      valueType?: string
    ) => {
      if (!selectedProvider) return

      const target = event.target
      let value: unknown
      if (target.type === 'checkbox') {
        // For native DOM events, .checked carries the truth.
        // For our synthetic union variant, callers pass .checked alongside
        // .value (which mirrors checked), so reading either is fine.
        value =
          'checked' in target && target.checked !== undefined
            ? target.checked
            : target.value
      } else {
        value = target.value
      }

      if (valueType === 'number') {
        value = Number(value)
      }

      const updatedProvider = { ...selectedProvider }
      set(updatedProvider, target.name, value)
      // createDevice only applies to YDWG source types. Drop a stale
      // value when the user picks a non-YDWG type so we don't submit a
      // hidden option that no longer has a UI control. On a brand-new
      // connection picking a YDWG type, default createDevice to on —
      // without it the gateway silently drops ISO Requests for PGN
      // 60928 / 126996 / 126998, leaving device identity incomplete.
      // Existing connections that already store a value are left alone:
      // an MFD on the bus may already be locked onto current $source
      // refs, and flipping createDevice on retroactively makes the
      // server claim a new address and disrupts that binding.
      if (target.name === 'options.type' && typeof value === 'string') {
        const isYdwg = /^ydwg02/.test(value)
        if (!isYdwg && updatedProvider.options?.createDevice !== undefined) {
          delete updatedProvider.options.createDevice
        } else if (
          isYdwg &&
          updatedProvider.isNew &&
          updatedProvider.options?.createDevice === undefined
        ) {
          set(updatedProvider, 'options.createDevice', true)
        }
      }
      setSelectedProvider(updatedProvider)
    },
    [selectedProvider]
  )

  const handleAddProvider = useCallback(() => {
    const newProvider: Provider = {
      type: 'NMEA2000',
      logging: false,
      isNew: true,
      id: '',
      enabled: true,
      options: { useCanName: true },
      editable: true
    }

    setSelectedProvider(structuredClone(newProvider))
    setSelectedIndex(providers.length - 1)

    setTimeout(() => {
      selectedProviderRef.current?.scrollIntoView()
    }, 0)
  }, [providers.length])

  const handleApply = useCallback(async () => {
    if (!selectedProvider) return

    const isNew = selectedProvider.isNew
    const wasDiscovered = selectedProvider.wasDiscovered
    const providerToSave = { ...selectedProvider }
    delete providerToSave.json

    const id = selectedProvider.originalId

    const response = await fetch(
      `${window.serverRoutesPrefix}/providers/${id && !isNew ? encodeURIComponent(id) : ''}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(providerToSave),
        credentials: 'include'
      }
    )

    if (response.ok) {
      const provider = structuredClone(selectedProvider)
      delete provider.isNew
      delete provider.wasDiscovered

      setProviders((prev) => {
        const newProviders = [...prev]
        if (isNew) {
          newProviders.push(provider)
        } else if (selectedIndex >= 0) {
          newProviders[selectedIndex] = provider
        }
        return newProviders
      })

      if (wasDiscovered && discoveredProviders) {
        // Note: discoveredProviders state is managed by Zustand store
        // Updates arrive via WebSocket DISCOVERED_PROVIDER events
      }

      setSelectedProvider(null)
      setSelectedIndex(-1)
      navigate('/data/connections/-')
    } else {
      const text = await response.text()
      alert(text)
    }
  }, [selectedProvider, selectedIndex, discoveredProviders, navigate])

  const handleCancel = useCallback(() => {
    setSelectedProvider(null)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!selectedProvider) return

    const response = await fetch(
      `${window.serverRoutesPrefix}/providers/${encodeURIComponent(selectedProvider.id)}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    )
    if (response.ok) {
      setProviders((prev) => {
        const newProviders = [...prev]
        if (selectedIndex >= 0) {
          newProviders.splice(selectedIndex, 1)
        }
        return newProviders
      })
      setSelectedProvider(null)
      setSelectedIndex(-1)
      runDiscovery()
    } else {
      const text = await response.text()
      alert(text)
    }
  }, [selectedProvider, selectedIndex, runDiscovery])

  const providerClicked = useCallback((provider: Provider, index: number) => {
    setSelectedProvider({
      ...structuredClone(provider),
      originalId: provider.id
    })
    setSelectedIndex(index)

    setTimeout(() => {
      selectedProviderRef.current?.scrollIntoView()
    }, 0)
  }, [])

  return (
    <div className="animated fadeIn">
      {discoveredProviders && discoveredProviders.length > 0 && (
        <Card>
          <Card.Header>Discovered Connections</Card.Header>
          <Card.Body>
            <Table hover responsive bordered striped size="sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Data Type</th>
                  <th>Enabled</th>
                  <th>Data Logging</th>
                </tr>
              </thead>
              <tbody>
                {(discoveredProviders || []).map((provider, index) => {
                  return (
                    <tr
                      onClick={() => providerClicked(provider, index)}
                      key={provider.id}
                    >
                      <td>{provider.id}</td>
                      <td>
                        <ProviderType provider={provider} />
                      </td>
                      <td>
                        <ApplicableStatus
                          applicable={provider.editable}
                          toggle={provider.enabled}
                        />
                      </td>
                      <td>
                        <ApplicableStatus
                          applicable={provider.editable}
                          toggle={provider.logging}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}
      <Card>
        <Card.Header>Connections</Card.Header>
        <Card.Body>
          <Table hover responsive bordered striped size="sm">
            <thead>
              <tr>
                <th>ID</th>
                <th>Data Type</th>
                <th>Enabled</th>
                <th>Data Logging</th>
              </tr>
            </thead>
            <tbody>
              {(providers || []).map((provider, index) => {
                return (
                  <tr
                    onClick={() => providerClicked(provider, index)}
                    key={provider.id}
                  >
                    <td>{provider.id}</td>
                    <td>
                      <ProviderType provider={provider} />
                    </td>
                    <td>
                      <ApplicableStatus
                        applicable={provider.editable}
                        toggle={provider.enabled}
                      />
                    </td>
                    <td>
                      <ApplicableStatus
                        applicable={provider.editable}
                        toggle={provider.logging}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card.Body>
        <Card.Footer>
          <Button size="sm" variant="primary" onClick={handleAddProvider}>
            <FontAwesomeIcon icon={faCirclePlus} /> Add
          </Button>
        </Card.Footer>
      </Card>

      {selectedProvider && (
        <div ref={selectedProviderRef} style={{ scrollMarginTop: '54px' }}>
          <Card>
            <Card.Body>
              {selectedProvider.editable ? (
                <BasicProvider
                  value={selectedProvider}
                  onChange={handleProviderChange}
                  onPropChange={handleProviderChange}
                />
              ) : (
                <Form.Control
                  as="textarea"
                  name="json"
                  id="json"
                  rows={20}
                  value={selectedProvider.json}
                  readOnly
                />
              )}
            </Card.Body>
            <Card.Footer>
              {selectedProvider.editable ? (
                <div className="d-flex flex-wrap gap-2">
                  <Button size="sm" variant="primary" onClick={handleApply}>
                    <FontAwesomeIcon icon={faCircleDot} /> Apply
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleCancel}>
                    <FontAwesomeIcon icon={faBan} /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    className="ms-auto"
                    onClick={handleDelete}
                  >
                    <FontAwesomeIcon icon={faBan} /> Delete
                  </Button>
                </div>
              ) : (
                <div className="text-end">
                  <Button size="sm" variant="danger" onClick={handleDelete}>
                    <FontAwesomeIcon icon={faBan} /> Delete
                  </Button>
                </div>
              )}
            </Card.Footer>
          </Card>
        </div>
      )}
    </div>
  )
}

interface ApplicableStatusProps {
  applicable: boolean
  toggle: boolean
}

const ApplicableStatus: React.FC<ApplicableStatusProps> = ({
  applicable,
  toggle
}) => <div>{applicable ? (toggle ? 'Yes' : 'No') : 'N/A'}</div>

interface ProviderTypeProps {
  provider: Provider
}

const ProviderType: React.FC<ProviderTypeProps> = ({ provider }) => (
  <div>
    {provider.type}
    {provider.type === 'FileStream'
      ? `/${(provider.options as { dataType?: string })?.dataType || ''}`
      : ''}
  </div>
)

export default ProvidersConfiguration
