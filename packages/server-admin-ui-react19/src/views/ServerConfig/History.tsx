import React, { useState, useEffect, useCallback } from 'react'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Row,
  Col,
  Badge,
  Alert,
  Form,
  FormGroup,
  Label,
  Input,
  Table
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons/faCircleNotch'
import { faDatabase } from '@fortawesome/free-solid-svg-icons/faDatabase'
import { faChartLine } from '@fortawesome/free-solid-svg-icons/faChartLine'
import { faPlay } from '@fortawesome/free-solid-svg-icons/faPlay'
import { faStop } from '@fortawesome/free-solid-svg-icons/faStop'
import { faSync } from '@fortawesome/free-solid-svg-icons/faSync'
import { faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons/faExternalLinkAlt'
import { useRuntimeConfig } from '../../store'
import {
  historyApi,
  shouldUseKeeper,
  type HistorySystemStatus,
  type HistorySettings,
  type HistoryCredentials
} from '../../services/api'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const History: React.FC = () => {
  const { useKeeper } = useRuntimeConfig()

  const [status, setStatus] = useState<HistorySystemStatus | null>(null)
  const [settings, setSettings] = useState<HistorySettings | null>(null)
  const [credentials, setCredentials] = useState<HistoryCredentials | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isEnabling, setIsEnabling] = useState(false)
  const [isDisabling, setIsDisabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Form state for enabling
  const [retentionDays, setRetentionDays] = useState(365)

  useEffect(() => {
    if (useKeeper && shouldUseKeeper()) {
      loadData()
    }
  }, [useKeeper])

  const loadData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [statusResult, settingsResult] = await Promise.all([
        historyApi.status(),
        historyApi.settings()
      ])
      if (statusResult) setStatus(statusResult)
      if (settingsResult) {
        setSettings(settingsResult)
        setRetentionDays(settingsResult.retentionDays)
      }

      // Load credentials if enabled
      if (statusResult?.status === 'running') {
        try {
          const creds = await historyApi.credentials()
          if (creds) setCredentials(creds)
        } catch {
          // Credentials may not be available yet
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load history data'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleEnable = useCallback(async () => {
    if (
      !confirm(
        'Enable history database? This will start InfluxDB and Grafana containers.'
      )
    ) {
      return
    }
    setIsEnabling(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await historyApi.enable({ retentionDays })
      if (result.success) {
        setSuccess('History database enabled successfully!')
        if (result.credentials) {
          setCredentials(result.credentials)
        }
        await loadData()
      } else {
        setError(result.error || 'Failed to enable history')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable history')
    } finally {
      setIsEnabling(false)
    }
  }, [retentionDays])

  const handleDisable = useCallback(async (retainData: boolean) => {
    const message = retainData
      ? 'Disable history? Data will be preserved for future re-enable.'
      : 'Disable history and DELETE all data? This cannot be undone!'
    if (!confirm(message)) {
      return
    }
    setIsDisabling(true)
    setError(null)
    setSuccess(null)
    try {
      await historyApi.disable(retainData)
      setSuccess('History database disabled')
      setCredentials(null)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable history')
    } finally {
      setIsDisabling(false)
    }
  }, [])

  const handleUpdateRetention = useCallback(async () => {
    setError(null)
    try {
      const newSettings = await historyApi.updateRetention(retentionDays)
      setSettings(newSettings)
      setSuccess('Retention policy updated')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to update retention'
      )
    }
  }, [retentionDays])

  const handleRefreshGrafana = useCallback(async () => {
    setError(null)
    try {
      await historyApi.grafana.refresh()
      setSuccess('Grafana datasources refreshed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh Grafana')
    }
  }, [])

  const getStatusBadge = (containerStatus: string) => {
    const colors: Record<string, string> = {
      running: 'success',
      stopped: 'secondary',
      starting: 'info',
      error: 'danger',
      not_found: 'warning'
    }
    return (
      <Badge color={colors[containerStatus] || 'secondary'}>
        {containerStatus}
      </Badge>
    )
  }

  const getHealthBadge = (health?: string) => {
    if (!health || health === 'none') return null
    const colors: Record<string, string> = {
      healthy: 'success',
      unhealthy: 'danger',
      starting: 'info'
    }
    return (
      <Badge color={colors[health] || 'secondary'} className="ms-1">
        {health}
      </Badge>
    )
  }

  // Not in Keeper mode
  if (!useKeeper || !shouldUseKeeper()) {
    return (
      <div className="animated fadeIn">
        <Card>
          <CardHeader>History Database</CardHeader>
          <CardBody>
            <Alert color="info">
              History database management is only available when running with
              the Universal Installer (Keeper).
            </Alert>
          </CardBody>
        </Card>
      </div>
    )
  }

  const isRunning = status?.status === 'running'
  const isDisabled = status?.status === 'disabled'
  const grafanaPort = 3003 // Default Grafana port
  const influxPort = 3002 // Default InfluxDB port

  return (
    <div className="animated fadeIn">
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert color="success" toggle={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Status Overview */}
      <Card className="mb-4">
        <CardHeader>
          <FontAwesomeIcon icon={faDatabase} className="me-2" />
          History Database
          {status && (
            <span className="float-end">
              <Badge
                color={
                  status.status === 'running'
                    ? 'success'
                    : status.status === 'error'
                      ? 'danger'
                      : 'secondary'
                }
              >
                {status.status.toUpperCase()}
              </Badge>
            </span>
          )}
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="text-center">
              <FontAwesomeIcon icon={faCircleNotch} spin size="2x" />
            </div>
          ) : status ? (
            <>
              <p className="text-muted">
                The history feature stores Signal K data in InfluxDB for
                historical analysis and visualization with Grafana.
              </p>
              {isRunning && (
                <Row>
                  <Col md={6}>
                    <h6>Containers</h6>
                    <Table size="sm" borderless>
                      <tbody>
                        <tr>
                          <td>InfluxDB</td>
                          <td className="text-end">
                            {getStatusBadge(status.influxdb.status)}
                            {getHealthBadge(status.influxdb.health)}
                          </td>
                        </tr>
                        {status.grafana && (
                          <tr>
                            <td>Grafana</td>
                            <td className="text-end">
                              {getStatusBadge(status.grafana.status)}
                              {getHealthBadge(status.grafana.health)}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </Table>
                  </Col>
                  <Col md={6}>
                    <h6>Plugin Status</h6>
                    <Table size="sm" borderless>
                      <tbody>
                        <tr>
                          <td>Installed</td>
                          <td className="text-end">
                            <Badge
                              color={
                                status.plugin.installed ? 'success' : 'warning'
                              }
                            >
                              {status.plugin.installed ? 'Yes' : 'No'}
                            </Badge>
                          </td>
                        </tr>
                        <tr>
                          <td>Enabled</td>
                          <td className="text-end">
                            <Badge
                              color={
                                status.plugin.enabled ? 'success' : 'secondary'
                              }
                            >
                              {status.plugin.enabled ? 'Yes' : 'No'}
                            </Badge>
                          </td>
                        </tr>
                        <tr>
                          <td>Configured</td>
                          <td className="text-end">
                            <Badge
                              color={
                                status.plugin.configured
                                  ? 'success'
                                  : 'secondary'
                              }
                            >
                              {status.plugin.configured ? 'Yes' : 'No'}
                            </Badge>
                          </td>
                        </tr>
                      </tbody>
                    </Table>
                  </Col>
                </Row>
              )}
              {status.storageUsed !== undefined && (
                <p>
                  <small className="text-muted">
                    Storage used: {formatBytes(status.storageUsed)}
                    {status.oldestDataPoint &&
                      ` | Data since: ${new Date(status.oldestDataPoint).toLocaleDateString()}`}
                  </small>
                </p>
              )}
              {status.lastError && (
                <Alert color="warning" className="mt-2">
                  Last error: {status.lastError}
                </Alert>
              )}
            </>
          ) : (
            <p className="text-muted">Unable to load status</p>
          )}
        </CardBody>
        <CardFooter>
          <Button
            color="secondary"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faSync} spin={isLoading} /> Refresh
          </Button>
        </CardFooter>
      </Card>

      {/* Enable/Disable Card */}
      {isDisabled && (
        <Card className="mb-4">
          <CardHeader>Enable History</CardHeader>
          <CardBody>
            <p>
              Enable the history database to store Signal K data over time. This
              will:
            </p>
            <ul>
              <li>Start an InfluxDB container for data storage</li>
              <li>Start a Grafana container for visualization</li>
              <li>Install and configure the signalk-to-influxdb2 plugin</li>
            </ul>
            <Form>
              <FormGroup row>
                <Label sm={4}>Retention Period (days)</Label>
                <Col sm={4}>
                  <Input
                    type="number"
                    min={7}
                    max={3650}
                    value={retentionDays}
                    onChange={(e) =>
                      setRetentionDays(parseInt(e.target.value) || 365)
                    }
                  />
                  <small className="text-muted">
                    Data older than this will be automatically deleted (7-3650
                    days)
                  </small>
                </Col>
              </FormGroup>
            </Form>
          </CardBody>
          <CardFooter>
            <Button
              color="success"
              onClick={handleEnable}
              disabled={isEnabling}
            >
              {isEnabling ? (
                <FontAwesomeIcon icon={faCircleNotch} spin />
              ) : (
                <FontAwesomeIcon icon={faPlay} />
              )}{' '}
              Enable History Database
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Running - Settings Card */}
      {isRunning && settings && (
        <Card className="mb-4">
          <CardHeader>Settings</CardHeader>
          <CardBody>
            <Form>
              <FormGroup row>
                <Label sm={4}>Retention Period</Label>
                <Col sm={4}>
                  <Input
                    type="number"
                    min={7}
                    max={3650}
                    value={retentionDays}
                    onChange={(e) =>
                      setRetentionDays(parseInt(e.target.value) || 365)
                    }
                  />
                </Col>
                <Col sm={4}>
                  <Button
                    color="primary"
                    size="sm"
                    onClick={handleUpdateRetention}
                    disabled={retentionDays === settings.retentionDays}
                  >
                    Update
                  </Button>
                </Col>
              </FormGroup>
              <FormGroup row>
                <Label sm={4}>Organization</Label>
                <Col sm={4}>
                  <Input type="text" value={settings.org} disabled />
                </Col>
              </FormGroup>
              <FormGroup row>
                <Label sm={4}>Bucket</Label>
                <Col sm={4}>
                  <Input type="text" value={settings.bucket} disabled />
                </Col>
              </FormGroup>
            </Form>
          </CardBody>
        </Card>
      )}

      {/* Access Links Card */}
      {isRunning && credentials && (
        <Card className="mb-4">
          <CardHeader>
            <FontAwesomeIcon icon={faChartLine} className="me-2" />
            Access
          </CardHeader>
          <CardBody>
            <Row>
              <Col md={6}>
                <h6>Grafana Dashboard</h6>
                <p className="text-muted">
                  View historical data with pre-configured dashboards
                </p>
                {credentials.grafanaUser && (
                  <Table size="sm" borderless className="mb-2">
                    <tbody>
                      <tr>
                        <td className="text-muted">Username:</td>
                        <td><code>{credentials.grafanaUser}</code></td>
                      </tr>
                      <tr>
                        <td className="text-muted">Password:</td>
                        <td><code>{credentials.grafanaPassword}</code></td>
                      </tr>
                    </tbody>
                  </Table>
                )}
                <Button
                  color="primary"
                  tag="a"
                  href={
                    credentials.grafanaUrl ||
                    `http://${window.location.hostname}:${grafanaPort}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} /> Open Grafana
                </Button>
              </Col>
              <Col md={6}>
                <h6>InfluxDB UI</h6>
                <p className="text-muted">
                  Direct access to the database for advanced queries
                </p>
                {credentials.influxUser && (
                  <Table size="sm" borderless className="mb-2">
                    <tbody>
                      <tr>
                        <td className="text-muted">Username:</td>
                        <td><code>{credentials.influxUser}</code></td>
                      </tr>
                      <tr>
                        <td className="text-muted">Password:</td>
                        <td><code>{credentials.influxPassword}</code></td>
                      </tr>
                    </tbody>
                  </Table>
                )}
                <Button
                  color="secondary"
                  tag="a"
                  href={
                    credentials.influxUrl ||
                    `http://${window.location.hostname}:${influxPort}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} /> Open InfluxDB
                </Button>
              </Col>
            </Row>
          </CardBody>
          <CardFooter>
            <Button color="info" size="sm" onClick={handleRefreshGrafana}>
              <FontAwesomeIcon icon={faSync} /> Refresh Grafana Token
            </Button>
            <small className="text-muted ms-2">
              Use this after changing SignalK security settings
            </small>
          </CardFooter>
        </Card>
      )}

      {/* Disable Card */}
      {isRunning && (
        <Card className="border-danger">
          <CardHeader className="text-danger">Disable History</CardHeader>
          <CardBody>
            <p>
              Stop the history database containers. You can choose to keep the
              data for later re-enabling.
            </p>
          </CardBody>
          <CardFooter>
            <Button
              color="warning"
              className="me-2"
              onClick={() => handleDisable(true)}
              disabled={isDisabling}
            >
              {isDisabling ? (
                <FontAwesomeIcon icon={faCircleNotch} spin />
              ) : (
                <FontAwesomeIcon icon={faStop} />
              )}{' '}
              Disable (Keep Data)
            </Button>
            <Button
              color="danger"
              onClick={() => handleDisable(false)}
              disabled={isDisabling}
            >
              <FontAwesomeIcon icon={faStop} /> Disable and Delete Data
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

export default History
