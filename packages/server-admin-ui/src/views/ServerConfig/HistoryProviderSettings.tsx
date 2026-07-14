import React, { useState, useEffect, useCallback } from 'react'
import Alert from 'react-bootstrap/Alert'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons/faClockRotateLeft'

const PROVIDERS_PATH = '/signalk/v2/api/history/_providers'

interface ProvidersState {
  ids: string[]
  /** Provider currently serving unqualified History API requests */
  defaultId: string | null
  /** Provider persisted in server settings; may not be registered */
  configuredId: string | null
}

const HistoryProviderSettings: React.FC = () => {
  const [providers, setProviders] = useState<ProvidersState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const fetchProviders = useCallback(async () => {
    try {
      const [providersRes, defaultRes] = await Promise.all([
        fetch(PROVIDERS_PATH, { credentials: 'include' }),
        fetch(`${PROVIDERS_PATH}/_default`, { credentials: 'include' })
      ])
      if (!providersRes.ok || !defaultRes.ok) {
        return
      }
      const providersBody = (await providersRes.json()) as Record<
        string,
        { isDefault: boolean }
      >
      const defaultBody = (await defaultRes.json()) as {
        id?: string
        configured?: string
      }
      setProviders({
        ids: Object.keys(providersBody),
        defaultId: defaultBody.id ?? null,
        configuredId: defaultBody.configured ?? null
      })
    } catch (e) {
      console.error('Failed to fetch history providers:', e)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
  }, [fetchProviders])

  const handleChange = useCallback(
    async (id: string) => {
      setSaveError(null)
      setSaved(false)
      try {
        const res = await fetch(`${PROVIDERS_PATH}/_default/${id}`, {
          method: 'POST',
          credentials: 'include'
        })
        if (res.ok) {
          setSaved(true)
          setTimeout(() => setSaved(false), 3000)
        } else {
          const body = await res.json()
          setSaveError(body.message || `Save failed (HTTP ${res.status})`)
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
      }
      await fetchProviders()
    },
    [fetchProviders]
  )

  if (providers === null) {
    return null
  }

  const configuredButUnavailable =
    providers.configuredId !== null &&
    !providers.ids.includes(providers.configuredId)

  return (
    <Card>
      <Card.Header>
        <FontAwesomeIcon icon={faClockRotateLeft} />{' '}
        <strong>History Provider</strong>
      </Card.Header>
      <Card.Body>
        <Form.Group as={Row} className="mb-0">
          <Col md={2}>
            <Form.Label>Default Provider</Form.Label>
          </Col>
          <Col xs="12" md={10}>
            {providers.ids.length === 0 ? (
              <Form.Text className="text-muted">
                No history providers are registered. Enable a plugin that
                provides the History API to select a default.
              </Form.Text>
            ) : (
              <>
                <Form.Select
                  value={providers.defaultId ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    handleChange(e.target.value)
                  }
                  style={{ maxWidth: '300px' }}
                >
                  {providers.ids.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  Serves History API requests that do not specify a provider.
                  The setting persists across restarts and does not depend on
                  plugin load order.
                </Form.Text>
              </>
            )}
            {configuredButUnavailable && (
              <Alert
                variant="warning"
                style={{ marginTop: '10px', marginBottom: 0 }}
              >
                The configured default provider &quot;{providers.configuredId}
                &quot; is not currently available
                {providers.defaultId
                  ? ` — using "${providers.defaultId}" as fallback`
                  : ''}
                . It will become the default again when its plugin is enabled.
              </Alert>
            )}
            {saved && (
              <Alert
                variant="success"
                style={{ marginTop: '10px', marginBottom: 0 }}
              >
                Default history provider saved.
              </Alert>
            )}
            {saveError && (
              <Alert
                variant="danger"
                style={{ marginTop: '10px', marginBottom: 0 }}
              >
                {saveError}
              </Alert>
            )}
          </Col>
        </Form.Group>
      </Card.Body>
    </Card>
  )
}

export default HistoryProviderSettings
