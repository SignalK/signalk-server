import React, { useState, useEffect, useCallback } from 'react'
import Alert from 'react-bootstrap/Alert'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons/faClockRotateLeft'

const PROVIDERS_PATH = '/signalk/v2/api/history/_providers'
const SAVED_MESSAGE_CLEAR_MS = 3000

interface ProvidersState {
  ids: string[]
  /** Provider currently serving unqualified History API requests */
  defaultId: string | null
  /** Provider persisted in server settings; may not be registered */
  configuredId: string | null
}

const HistoryProviderSettings: React.FC = () => {
  const [providers, setProviders] = useState<ProvidersState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const fetchProviders = useCallback(async () => {
    try {
      const [providersRes, defaultRes] = await Promise.all([
        fetch(PROVIDERS_PATH, { credentials: 'include' }),
        fetch(`${PROVIDERS_PATH}/_default`, { credentials: 'include' })
      ])
      if (!providersRes.ok || !defaultRes.ok) {
        setLoadError(
          `Failed to load history providers (HTTP ${
            providersRes.ok ? defaultRes.status : providersRes.status
          })`
        )
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
      setLoadError(null)
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Failed to load history providers'
      )
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
        const res = await fetch(
          `${PROVIDERS_PATH}/_default/${encodeURIComponent(id)}`,
          {
            method: 'POST',
            credentials: 'include'
          }
        )
        if (res.ok) {
          setSaved(true)
          setTimeout(() => setSaved(false), SAVED_MESSAGE_CLEAR_MS)
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

  const configuredButUnavailable =
    providers !== null &&
    providers.configuredId !== null &&
    !providers.ids.includes(providers.configuredId)

  // The choice only matters when there is something to choose between:
  // stay hidden for zero or one registered provider, unless the
  // persisted choice points at an unavailable provider (worth a
  // warning) or loading failed.
  const visible =
    loadError !== null ||
    (providers !== null &&
      (providers.ids.length > 1 || configuredButUnavailable))

  if (!visible) {
    return null
  }

  return (
    <Card className="mb-3">
      <Card.Header>
        <FontAwesomeIcon icon={faClockRotateLeft} />{' '}
        <strong>Default History Provider</strong>
      </Card.Header>
      <Card.Body>
        {loadError && (
          <Alert variant="danger" className="mb-0">
            {loadError}
          </Alert>
        )}
        {providers !== null && (
          <Form.Group
            as={Row}
            className="mb-0"
            controlId="historyDefaultProvider"
          >
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
                    {!providers.defaultId && (
                      <option value="" disabled>
                        Select a provider...
                      </option>
                    )}
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
                <Alert variant="warning" className="mt-2 mb-0">
                  The configured default provider &quot;
                  {providers.configuredId}&quot; is not currently available
                  {providers.defaultId
                    ? ` — using "${providers.defaultId}" as fallback`
                    : ''}
                  . It will become the default again when its plugin is enabled.
                </Alert>
              )}
              {saved && (
                <Alert variant="success" className="mt-2 mb-0">
                  Default history provider saved.
                </Alert>
              )}
              {saveError && (
                <Alert variant="danger" className="mt-2 mb-0">
                  {saveError}
                </Alert>
              )}
            </Col>
          </Form.Group>
        )}
      </Card.Body>
    </Card>
  )
}

export default HistoryProviderSettings
