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
import SourcePriorities from './SourcePriorities'
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
        | { target: { name: string; value: unknown; type?: string } },
      valueType?: string
    ) => {
      if (!selectedProvider) return

      let value: unknown =
        event.target.type === 'checkbox'
          ? (event.target as HTMLInputElement).checked
          : event.target.value

      if (valueType === 'number') {
        value = Number(value)
      }

      const updatedProvider = { ...selectedProvider }
      set(updatedProvider, event.target.name, value)
      setSelectedProvider(updatedProvider)
    },
    [selectedProvider]
  )

  const handleProviderPropChange = useCallback(() => {
    setSelectedProvider((prev) => (prev ? { ...prev } : null))
  }, [])

  const handleAddProvider = useCallback(() => {
    const newProvider: Provider = {
      type: 'NMEA2000',
      logging: false,
      isNew: true,
      id: '',
      enabled: true,
      options: {},
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
      `${window.serverRoutesPrefix}/providers/${id && !isNew ? id : ''}`,
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
      navigate('/serverConfiguration/connections/-')
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
      `${window.serverRoutesPrefix}/providers/${selectedProvider.id}`,
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
    } else {
      const text = await response.text()
      alert(text)
    }
  }, [selectedProvider, selectedIndex])

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
                  onPropChange={handleProviderPropChange}
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

      <SourcePriorities />
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
