import React, { useCallback, useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Table,
  Badge,
  Progress,
  Alert,
  Row,
  Col,
  FormGroup,
  Label
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons/faCircleNotch'
import { faDownload } from '@fortawesome/free-solid-svg-icons/faDownload'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faUndo } from '@fortawesome/free-solid-svg-icons/faUndo'
import { faSync } from '@fortawesome/free-solid-svg-icons/faSync'
import { useZustandAppStore, useRuntimeConfig } from '../../store'
import {
  updateApi,
  shouldUseKeeper,
  type VersionListResponse,
  type UpdateStatus,
  type ImageVersion
} from '../../services/api'

interface InstallingApp {
  name: string
  isWaiting?: boolean
  isInstalling?: boolean
}

interface AppStore {
  storeAvailable: boolean
  canUpdateServer: boolean
  isInDocker: boolean
  serverUpdate: string | null
  installing: InstallingApp[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

const ServerUpdate: React.FC = () => {
  const navigate = useNavigate()
  const appStore = useZustandAppStore() as AppStore
  const { useKeeper } = useRuntimeConfig()

  // Keeper-specific state
  const [versions, setVersions] = useState<VersionListResponse | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPulling, setIsPulling] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Load versions on mount
  useEffect(() => {
    if (useKeeper && shouldUseKeeper()) {
      loadVersions()
      loadUpdateStatus()
    }

    return () => {
      // Cleanup SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [useKeeper])

  // Subscribe to update progress when update is in progress
  useEffect(() => {
    const state = updateStatus?.state
    if (
      state &&
      state !== 'idle' &&
      state !== 'complete' &&
      state !== 'failed'
    ) {
      // Set up SSE subscription inline to avoid dependency issues
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      const es = updateApi.subscribeProgress((status) => {
        setUpdateStatus(status)
        if (status.state === 'complete' || status.state === 'failed') {
          eventSourceRef.current?.close()
          eventSourceRef.current = null
          loadVersions()
        }
      })

      if (es) {
        eventSourceRef.current = es
        es.onerror = () => {
          console.error('SSE connection error')
          es.close()
          eventSourceRef.current = null
        }
      }
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [updateStatus?.state])

  const loadVersions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const versionList = await updateApi.listVersions()
      if (versionList) {
        setVersions(versionList)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load versions')
    } finally {
      setIsLoading(false)
    }
  }

  const loadUpdateStatus = async () => {
    try {
      const status = await updateApi.status()
      if (status) {
        setUpdateStatus(status)
      }
    } catch (err) {
      console.error('Failed to load update status:', err)
    }
  }

  const subscribeToProgress = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = updateApi.subscribeProgress((status) => {
      setUpdateStatus(status)
      if (status.state === 'complete' || status.state === 'failed') {
        eventSourceRef.current?.close()
        eventSourceRef.current = null
        // Reload versions after update completes
        loadVersions()
      }
    })

    if (es) {
      eventSourceRef.current = es
      es.onerror = () => {
        console.error('SSE connection error')
        es.close()
        eventSourceRef.current = null
      }
    }
  }

  const handlePullVersion = async (tag: string) => {
    setIsPulling(tag)
    setError(null)
    try {
      await updateApi.pullVersion(tag)
      await loadVersions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull version')
    } finally {
      setIsPulling(null)
    }
  }

  const handleSwitchVersion = async (tag: string) => {
    if (
      !confirm(
        `Are you sure you want to switch to version ${tag}? This will restart the server.`
      )
    ) {
      return
    }
    setError(null)
    try {
      await updateApi.switchVersion(tag)
      setUpdateStatus({ state: 'switching', message: 'Switching version...' })
      subscribeToProgress()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch version')
    }
  }

  const handleStartUpdate = async (tag?: string) => {
    if (
      !confirm(
        'Are you sure you want to start the update? This will create a backup and restart the server.'
      )
    ) {
      return
    }
    setError(null)
    try {
      await updateApi.start(tag)
      setUpdateStatus({ state: 'checking', message: 'Starting update...' })
      subscribeToProgress()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start update')
    }
  }

  const handleRollback = async () => {
    if (
      !confirm('Are you sure you want to rollback to the previous version?')
    ) {
      return
    }
    setError(null)
    try {
      await updateApi.rollback()
      setUpdateStatus({ state: 'rolling_back', message: 'Rolling back...' })
      subscribeToProgress()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rollback')
    }
  }

  // Standard update handler for non-Keeper mode
  const handleUpdate = useCallback(() => {
    if (confirm(`Are you sure you want to update the server?`)) {
      navigate('/appstore/updates')
      fetch(
        `${window.serverRoutesPrefix}/appstore/install/signalk-server/${appStore.serverUpdate}`,
        {
          method: 'POST',
          credentials: 'include'
        }
      )
    }
  }, [appStore.serverUpdate, navigate])

  // Keeper mode UI
  if (useKeeper && shouldUseKeeper()) {
    const getStatusColor = (state: string) => {
      switch (state) {
        case 'complete':
          return 'success'
        case 'failed':
          return 'danger'
        case 'rolling_back':
          return 'warning'
        default:
          return 'info'
      }
    }

    const getStatusText = (status: UpdateStatus) => {
      switch (status.state) {
        case 'idle':
          return 'Ready'
        case 'checking':
          return 'Checking for updates...'
        case 'pulling':
          return `Pulling new image... ${status.progress || 0}%`
        case 'backup':
          return 'Creating backup...'
        case 'switching':
          return 'Switching version...'
        case 'verifying':
          return 'Verifying new version...'
        case 'complete':
          return 'Update complete!'
        case 'failed':
          return `Update failed: ${status.error || 'Unknown error'}`
        case 'rolling_back':
          return 'Rolling back to previous version...'
        default:
          return status.message || 'Unknown state'
      }
    }

    const renderVersionRow = (version: ImageVersion, isCurrent: boolean) => (
      <tr key={version.tag} className={isCurrent ? 'table-success' : ''}>
        <td>
          {version.tag}
          {isCurrent && (
            <Badge color="success" className="ms-2">
              Current
            </Badge>
          )}
        </td>
        <td>{formatDate(version.created)}</td>
        <td>{formatBytes(version.size)}</td>
        <td>
          {version.isLocal ? (
            <Badge color="primary">Local</Badge>
          ) : (
            <Badge color="secondary">Remote</Badge>
          )}
        </td>
        <td>
          {!version.isLocal && (
            <Button
              size="sm"
              color="info"
              className="me-1"
              onClick={() => handlePullVersion(version.tag)}
              disabled={isPulling !== null}
              title="Pull this version"
            >
              {isPulling === version.tag ? (
                <FontAwesomeIcon icon={faCircleNotch} spin />
              ) : (
                <FontAwesomeIcon icon={faDownload} />
              )}
            </Button>
          )}
          {version.isLocal && !isCurrent && (
            <Button
              size="sm"
              color="warning"
              onClick={() => handleSwitchVersion(version.tag)}
              disabled={
                updateStatus?.state !== 'idle' &&
                updateStatus?.state !== undefined
              }
              title="Switch to this version"
            >
              <FontAwesomeIcon icon={faSync} /> Switch
            </Button>
          )}
          {isCurrent && (
            <span className="text-muted">
              <FontAwesomeIcon icon={faCheck} /> Active
            </span>
          )}
        </td>
      </tr>
    )

    return (
      <div className="animated fadeIn">
        {error && (
          <Alert color="danger" toggle={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Current Status Card */}
        {versions && (
          <Card className="mb-4">
            <CardHeader>Current Version</CardHeader>
            <CardBody>
              <Row>
                <Col md={4}>
                  <FormGroup>
                    <Label>Version</Label>
                    <div className="h5">{versions.current.tag}</div>
                  </FormGroup>
                </Col>
                <Col md={4}>
                  <FormGroup>
                    <Label>Image Created</Label>
                    <div>{formatDate(versions.current.created)}</div>
                  </FormGroup>
                </Col>
                <Col md={4}>
                  <FormGroup>
                    <Label>Digest</Label>
                    <div className="text-muted small">
                      {versions.current.digest.slice(0, 20)}...
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardBody>
          </Card>
        )}

        {/* Update Progress Card */}
        {updateStatus && updateStatus.state !== 'idle' && (
          <Card className="mb-4">
            <CardHeader>
              Update Progress
              <Badge
                color={getStatusColor(updateStatus.state)}
                className="float-end"
              >
                {updateStatus.state}
              </Badge>
            </CardHeader>
            <CardBody>
              <p>{getStatusText(updateStatus)}</p>
              {updateStatus.progress !== undefined &&
                updateStatus.progress > 0 && (
                  <Progress
                    animated={
                      updateStatus.state !== 'complete' &&
                      updateStatus.state !== 'failed'
                    }
                    color={getStatusColor(updateStatus.state)}
                    value={updateStatus.progress}
                  >
                    {updateStatus.progress}%
                  </Progress>
                )}
              {updateStatus.currentStep && updateStatus.totalSteps && (
                <small className="text-muted">
                  Step {updateStatus.currentStep} of {updateStatus.totalSteps}
                </small>
              )}
            </CardBody>
            {updateStatus.state === 'failed' && (
              <CardFooter>
                <Button color="warning" onClick={handleRollback}>
                  <FontAwesomeIcon icon={faUndo} /> Rollback
                </Button>
              </CardFooter>
            )}
          </Card>
        )}

        {/* Available Versions Card */}
        <Card className="mb-4">
          <CardHeader>
            Available Versions
            <Button
              size="sm"
              color="secondary"
              className="float-end"
              onClick={loadVersions}
              disabled={isLoading}
            >
              {isLoading ? (
                <FontAwesomeIcon icon={faCircleNotch} spin />
              ) : (
                <FontAwesomeIcon icon={faSync} />
              )}{' '}
              Refresh
            </Button>
          </CardHeader>
          <CardBody>
            {isLoading ? (
              <div className="text-center">
                <FontAwesomeIcon icon={faCircleNotch} spin size="2x" />
              </div>
            ) : versions ? (
              <Table responsive size="sm">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Created</th>
                    <th>Size</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Current version first */}
                  {versions.local.find((v) => v.tag === versions.current.tag) &&
                    renderVersionRow(
                      versions.local.find(
                        (v) => v.tag === versions.current.tag
                      )!,
                      true
                    )}
                  {/* Other local versions */}
                  {versions.local
                    .filter((v) => v.tag !== versions.current.tag)
                    .map((v) => renderVersionRow(v, false))}
                  {/* Available remote versions not yet pulled */}
                  {versions.available
                    .filter((v) => !versions.local.find((l) => l.tag === v.tag))
                    .slice(0, 10) // Limit to 10 remote versions
                    .map((v) => renderVersionRow(v, false))}
                </tbody>
              </Table>
            ) : (
              <p className="text-muted">Unable to load versions</p>
            )}
          </CardBody>
          {versions && versions.available.length > 0 && (
            <CardFooter>
              <Button
                color="primary"
                onClick={() => handleStartUpdate()}
                disabled={
                  updateStatus?.state !== 'idle' &&
                  updateStatus?.state !== undefined
                }
              >
                <FontAwesomeIcon icon={faDownload} /> Update to Latest
              </Button>
            </CardFooter>
          )}
        </Card>

        {/* Sponsoring Card */}
        <Card>
          <CardHeader>Sponsoring</CardHeader>
          <CardBody>
            <p>
              If you find Signal K valuable to you consider sponsoring our work
              on developing it further.
            </p>
            <p>
              Your support allows us to do things like
              <ul>
                <li>travel to meet in person and push things forward</li>
                <li>purchase equipment to develop on</li>
                <li>upgrade our cloud resources beyond the free tiers</li>
              </ul>
            </p>
            <p>
              See{' '}
              <a href="https://opencollective.com/signalk">
                Signal K in Open Collective
              </a>{' '}
              for details.
            </p>
          </CardBody>
        </Card>
      </div>
    )
  }

  // Standard SignalK Server mode UI (original)
  if (!appStore.storeAvailable) {
    return (
      <div className="animated fadeIn">
        <Card>
          <CardHeader>Waiting for App store data to load...</CardHeader>
        </Card>
      </div>
    )
  }

  let isInstalling = false
  let isInstalled = false
  const info = appStore.installing.find((p) => p.name === 'signalk-server')
  if (info) {
    if (info.isWaiting || info.isInstalling) {
      isInstalling = true
    } else {
      isInstalled = true
    }
  }

  return (
    <div className="animated fadeIn">
      {!appStore.canUpdateServer && (
        <Card className="border-warning">
          <CardHeader>Server Update</CardHeader>
          <CardBody>
            This installation is not updatable from the admin user interface.
          </CardBody>
        </Card>
      )}
      {appStore.isInDocker && (
        <Card className="border-warning">
          <CardHeader>Running as a Docker container</CardHeader>
          <CardBody>
            <p>
              The server is running as a Docker container. You need to pull a
              new server version from Container registry to update.
              <ul>
                <code>docker pull cr.signalk.io/signalk/signalk-server</code>
              </ul>
            </p>
            <p>
              More info about running Signal K in Docker can be found at{' '}
              <a
                href="https://github.com/SignalK/signalk-server/blob/master/docker/README.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Docker README
              </a>{' '}
              .
            </p>
          </CardBody>
        </Card>
      )}
      {appStore.canUpdateServer &&
        appStore.serverUpdate &&
        !isInstalling &&
        !isInstalled && (
          <Card>
            <CardHeader>
              Server version {appStore.serverUpdate} is available
            </CardHeader>
            <CardBody>
              <a href="https://github.com/SignalK/signalk-server/releases/">
                Release Notes for latest releases.
              </a>
              <br />
              <br />
              <Button
                className="btn btn-danger"
                size="sm"
                color="primary"
                onClick={handleUpdate}
              >
                Update
              </Button>
            </CardBody>
          </Card>
        )}
      {isInstalling && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>The update is being installed</CardBody>
        </Card>
      )}
      {isInstalled && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>
            The update has been installed, please restart the Signal K server.
          </CardBody>
        </Card>
      )}
      {appStore.canUpdateServer && !appStore.serverUpdate && (
        <Card>
          <CardHeader>Server Update</CardHeader>
          <CardBody>Your server is up to date.</CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>Sponsoring</CardHeader>
        <CardBody>
          <p>
            If you find Signal K valuable to you consider sponsoring our work on
            developing it further.
          </p>
          <p>
            Your support allows us to do things like
            <ul>
              <li>travel to meet in person and push things forward</li>
              <li>purchase equipment to develop on</li>
              <li>upgrade our cloud resources beyond the free tiers</li>
            </ul>
          </p>
          <p>
            See{' '}
            <a href="https://opencollective.com/signalk">
              Signal K in Open Collective
            </a>{' '}
            for details.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

export default ServerUpdate
