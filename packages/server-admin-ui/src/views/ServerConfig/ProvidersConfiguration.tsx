import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Col,
  Table,
  Row
} from 'reactstrap'

import BasicProvider from './BasicProvider'
import SourcePriorities from './SourcePriorities'
import set from 'lodash.set'

interface Provider {
  id: string
  type: string
  enabled: boolean
  logging: boolean
  editable: boolean
  options?: Record<string, unknown>
  json?: string
  isNew?: boolean
  wasDiscovered?: boolean
  originalId?: string
}

interface RootState {
  discoveredProviders: Provider[]
}

const ProvidersConfiguration: React.FC = () => {
  const params = useParams<{ providerId?: string }>()
  const navigate = useNavigate()
  const discoveredProviders = useSelector(
    (state: RootState) => state.discoveredProviders
  )

  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(
    null
  )
  const [selectedIndex, setSelectedIndex] = useState<number>(-1)

  const selectedProviderRef = useRef<HTMLDivElement>(null)

  const fetchProviders = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/providers`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data: Provider[]) => {
        let foundProvider: Provider | undefined
        let foundIndex: number | undefined

        if (params.providerId) {
          foundProvider = data.find(
            (provider) => provider.id === params.providerId
          )
          foundIndex = data.findIndex(
            (provider) => provider.id === params.providerId
          )
        }

        if (foundProvider) {
          foundProvider.originalId = foundProvider.id
        }

        setProviders(data)
        setSelectedProvider(
          foundProvider ? JSON.parse(JSON.stringify(foundProvider)) : null
        )
        setSelectedIndex(foundIndex ?? -1)
      })
  }, [params.providerId])

  const runDiscovery = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/runDiscovery`, {
      method: 'PUT',
      credentials: 'include'
    })
  }, [])

  useEffect(() => {
    fetchProviders()
    runDiscovery()
  }, [fetchProviders, runDiscovery])

  const handleProviderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, type?: string) => {
      if (!selectedProvider) return

      let value: string | boolean | number =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value

      if (type === 'number') {
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

    setSelectedProvider(JSON.parse(JSON.stringify(newProvider)))
    setSelectedIndex(providers.length - 1)

    setTimeout(() => {
      selectedProviderRef.current?.scrollIntoView()
    }, 0)
  }, [providers.length])

  const handleApply = useCallback(() => {
    if (!selectedProvider) return

    const isNew = selectedProvider.isNew
    const wasDiscovered = selectedProvider.wasDiscovered
    const providerToSave = { ...selectedProvider }
    delete providerToSave.json

    const id = selectedProvider.originalId

    fetch(`${window.serverRoutesPrefix}/providers/${id && !isNew ? id : ''}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(providerToSave),
      credentials: 'include'
    })
      .then((response) => {
        if (response.ok) {
          const provider = JSON.parse(JSON.stringify(selectedProvider))
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
            // Note: discoveredProviders state is managed by Redux
            // The parent component should handle this
          }

          setSelectedProvider(null)
          setSelectedIndex(-1)
          navigate('/serverConfiguration/connections/-')
        }
        return response.text()
      })
      .then((text) => {
        alert(text)
      })
  }, [selectedProvider, selectedIndex, discoveredProviders, navigate])

  const handleCancel = useCallback(() => {
    setSelectedProvider(null)
  }, [])

  const handleDelete = useCallback(() => {
    if (!selectedProvider) return

    fetch(`${window.serverRoutesPrefix}/providers/${selectedProvider.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then((response) => response.text())
      .then((response) => {
        setProviders((prev) => {
          const newProviders = [...prev]
          if (selectedIndex >= 0) {
            newProviders.splice(selectedIndex, 1)
          }
          return newProviders
        })
        setSelectedProvider(null)
        setSelectedIndex(-1)
        alert(response)
      })
  }, [selectedProvider, selectedIndex])

  const providerClicked = useCallback((provider: Provider, index: number) => {
    setSelectedProvider({
      ...JSON.parse(JSON.stringify(provider)),
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
          <CardHeader>Discovered Connections</CardHeader>
          <CardBody>
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
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader>Connections</CardHeader>
        <CardBody>
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
        </CardBody>
        <CardFooter>
          <Button size="sm" color="primary" onClick={handleAddProvider}>
            <i className="fa fa-plus-circle" /> Add
          </Button>
        </CardFooter>
      </Card>

      {selectedProvider && (
        <div ref={selectedProviderRef} style={{ scrollMarginTop: '54px' }}>
          <Card>
            <CardBody>
              {selectedProvider.editable ? (
                <BasicProvider
                  value={selectedProvider}
                  onChange={handleProviderChange}
                  onPropChange={handleProviderPropChange}
                />
              ) : (
                <Input
                  type="textarea"
                  name="json"
                  id="json"
                  rows={20}
                  value={selectedProvider.json}
                  readOnly
                />
              )}
            </CardBody>
            <CardFooter>
              {selectedProvider.editable ? (
                <Row>
                  <Col xs="4" md="1">
                    <Button size="sm" color="primary" onClick={handleApply}>
                      <i className="fa fa-dot-circle-o" /> Apply
                    </Button>
                  </Col>
                  <Col xs="4" md="1">
                    <Button size="sm" color="secondary" onClick={handleCancel}>
                      <i className="fa fa-ban" /> Cancel
                    </Button>
                  </Col>
                  <Col xs="4" md="10" className="text-end">
                    <Button size="sm" color="danger" onClick={handleDelete}>
                      <i className="fa fa-ban" /> Delete
                    </Button>
                  </Col>
                </Row>
              ) : (
                <Row>
                  <Col xs="4" md="12" className="text-end">
                    <Button size="sm" color="danger" onClick={handleDelete}>
                      <i className="fa fa-ban" /> Delete
                    </Button>
                  </Col>
                </Row>
              )}
            </CardFooter>
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
