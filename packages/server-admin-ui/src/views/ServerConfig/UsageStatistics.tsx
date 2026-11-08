import React, { useEffect, useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Card from 'react-bootstrap/Card'
import Form from 'react-bootstrap/Form'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChartColumn } from '@fortawesome/free-solid-svg-icons/faChartColumn'

export interface UsageStatisticsStatus {
  enabled: boolean
  answered: boolean
}

export async function fetchUsageStatistics<T>(
  path = '',
  init?: RequestInit
): Promise<T> {
  const response = await fetch(
    `${window.serverRoutesPrefix}/settings/usageStatistics${path}`,
    { credentials: 'include', ...init }
  )
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export const saveUsageStatistics = (
  enabled: boolean
): Promise<UsageStatisticsStatus> =>
  fetchUsageStatistics<UsageStatisticsStatus>('', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  })

export const UsageStatisticsDescription: React.FC<{
  onToggle?: (open: boolean) => void
  children?: React.ReactNode
}> = ({ onToggle, children }) => (
  <Form.Text muted as="div">
    Share which plugins you use, anonymously. The totals help new users choose
    plugins, and show existing users which new plugins are catching on.
    Privacy-sensitive data, such as position, vessel name, MMSI, uuid or sensor
    data, is not shared.
    <details onToggle={(e) => onToggle?.(e.currentTarget.open)}>
      <summary>Details</summary>
      <ul className="mb-1">
        <li>
          System: Signal K and Node.js versions, operating system and its
          version, hardware model, CPU type, whether it runs in Docker, and a
          random installation ID
        </li>
        <li>
          Plugins: name and version of the installed plugins and webapps from
          the App Store, and whether each is enabled. Plugins that aren&apos;t
          in the App Store, such as ones you wrote yourself, are not named; only
          how many there are is sent.
        </li>
      </ul>
      <p className="mb-1">
        It is sent once a day. Upon receipt, the IP address is immediately
        hashed or discarded.
      </p>
      <p className="mb-1">
        The totals are public at{' '}
        <a href="https://usage.signalk.org" target="_blank" rel="noreferrer">
          usage.signalk.org
        </a>
      </p>
      {children}
    </details>
  </Form.Text>
)

const UsageStatistics: React.FC = () => {
  const [status, setStatus] = useState<UsageStatisticsStatus>()
  const [saving, setSaving] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [preview, setPreview] = useState<{ installationId?: string }>()
  const [error, setError] = useState<string>()

  useEffect(() => {
    fetchUsageStatistics<UsageStatisticsStatus>().then(setStatus, (e: Error) =>
      setError(e.message)
    )
  }, [])

  const loadPreview = () =>
    fetchUsageStatistics<{ installationId?: string }>('/report').then(
      setPreview,
      (e: Error) => setError(e.message)
    )

  const toggleDetails = (open: boolean) => {
    setDetailsOpen(open)
    if (open) {
      loadPreview()
    }
  }

  const save = (enabled: boolean) => {
    setSaving(true)
    setError(undefined)
    saveUsageStatistics(enabled)
      .then(
        (saved) => {
          setStatus(saved)
          // What is sent depends on the choice
          if (detailsOpen) {
            loadPreview()
          }
        },
        (e: Error) => setError(e.message)
      )
      .finally(() => setSaving(false))
  }

  return (
    <Card className="mt-3">
      <Card.Header>
        <FontAwesomeIcon icon={faChartColumn} />{' '}
        <strong>Usage Statistics</strong>
      </Card.Header>
      <Card.Body>
        <div className="d-flex align-items-center">
          <Form.Label
            style={{ marginRight: '15px', marginBottom: 0 }}
            className="switch switch-text switch-primary"
          >
            <input
              type="checkbox"
              id="usageStatistics"
              className="switch-input"
              disabled={saving}
              checked={status?.enabled ?? false}
              onChange={(e) => save(e.target.checked)}
            />
            <span className="switch-label" data-on="On" data-off="Off" />
            <span className="switch-handle" />
          </Form.Label>
          <label htmlFor="usageStatistics">
            Share which plugins this server uses
          </label>
        </div>
        <UsageStatisticsDescription onToggle={toggleDetails}>
          {preview && (
            <>
              {!preview.installationId && (
                <p className="mb-1">
                  When this is on, a random installation ID is added.
                </p>
              )}
              <pre>{JSON.stringify(preview, null, 2)}</pre>
            </>
          )}
        </UsageStatisticsDescription>
        {error && (
          <Alert variant="danger" className="mt-2 mb-0">
            {error}
          </Alert>
        )}
      </Card.Body>
    </Card>
  )
}

export default UsageStatistics
