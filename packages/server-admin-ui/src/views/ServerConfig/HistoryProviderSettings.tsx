import React, { useState, useCallback } from 'react'
import Alert from 'react-bootstrap/Alert'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons/faClockRotateLeft'
import {
  useHistoryProviders,
  isConfiguredProviderUnavailable,
  PROVIDERS_PATH
} from '../../hooks/useHistoryProviderStatus'

const SAVED_MESSAGE_CLEAR_MS = 3000

const HistoryProviderSettings: React.FC = () => {
  const { providers, loadError, refresh } = useHistoryProviders()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

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
          const body = (await res.json()) as { message?: string }
          setSaveError(body.message || `Save failed (HTTP ${res.status})`)
        }
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
      }
      await refresh()
    },
    [refresh]
  )

  const configuredButUnavailable = isConfiguredProviderUnavailable(providers)

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
        <strong>History API</strong>
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
            className="mb-0 align-items-baseline"
            controlId="historyDefaultProvider"
          >
            <Col md={2}>
              <Form.Label>Default provider plugin</Form.Label>
            </Col>
            <Col xs="12" md={2}>
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
            <Col xs="12" md={8}>
              <Form.Text className="text-muted">
                Serves History API requests that do not specify a provider
              </Form.Text>
            </Col>
          </Form.Group>
        )}
      </Card.Body>
    </Card>
  )
}

export default HistoryProviderSettings
