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
  Progress,
  Table
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons/faCircleNotch'
import { faHeartPulse } from '@fortawesome/free-solid-svg-icons/faHeartPulse'
import { faStethoscope } from '@fortawesome/free-solid-svg-icons/faStethoscope'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons/faExclamationTriangle'
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark'
import { faServer } from '@fortawesome/free-solid-svg-icons/faServer'
import { faSync } from '@fortawesome/free-solid-svg-icons/faSync'
import { useRuntimeConfig } from '../../store'
import {
  healthApi,
  serverApi,
  shouldUseKeeper,
  type HealthStatus,
  type DoctorResult,
  type SystemInfo,
  type ContainerInfo,
  type ContainerStats
} from '../../services/api'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const SystemHealth: React.FC = () => {
  const { useKeeper } = useRuntimeConfig()

  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null)
  const [doctorResult, setDoctorResult] = useState<DoctorResult | null>(null)
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [containerInfo, setContainerInfo] = useState<ContainerInfo | null>(null)
  const [containerStats, setContainerStats] = useState<ContainerStats | null>(
    null
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isRunningDoctor, setIsRunningDoctor] = useState(false)
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null)
  const [fixSuccess, setFixSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!useKeeper || !shouldUseKeeper()) {
      return
    }

    const loadHealthStatus = async () => {
      const status = await healthApi.check()
      if (status) {
        setHealthStatus(status)
      }
    }

    const loadSystemInfo = async () => {
      const info = await healthApi.systemInfo()
      if (info) {
        setSystemInfo(info)
      }
    }

    const loadContainerInfo = async () => {
      const info = await serverApi.getStatus()
      if (info) {
        setContainerInfo(info)
      }
    }

    const loadStats = async () => {
      const stats = await serverApi.getStats()
      if (stats) {
        setContainerStats(stats)
      }
    }

    const doLoadAllData = async () => {
      setIsLoading(true)
      setError(null)
      try {
        await Promise.all([
          loadHealthStatus(),
          loadSystemInfo(),
          loadContainerInfo(),
          loadStats()
        ])
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load health data'
        )
      } finally {
        setIsLoading(false)
      }
    }

    doLoadAllData()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [useKeeper])

  const loadAllData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [healthResult, systemResult, containerResult, statsResult] =
        await Promise.all([
          healthApi.check(),
          healthApi.systemInfo(),
          serverApi.getStatus(),
          serverApi.getStats()
        ])
      if (healthResult) setHealthStatus(healthResult)
      if (systemResult) setSystemInfo(systemResult)
      if (containerResult) setContainerInfo(containerResult)
      if (statsResult) setContainerStats(statsResult)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load health data'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const runDoctor = useCallback(async () => {
    setIsRunningDoctor(true)
    setError(null)
    setFixSuccess(null)
    try {
      const result = await healthApi.runDoctor()
      if (result) {
        setDoctorResult(result)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Doctor check failed')
    } finally {
      setIsRunningDoctor(false)
    }
  }, [])

  const applyFix = useCallback(
    async (fixId: string, fixTitle: string) => {
      setApplyingFixId(fixId)
      setError(null)
      setFixSuccess(null)
      try {
        const result = await healthApi.applyFix(fixId)
        if (result?.success) {
          setFixSuccess(`${fixTitle}: ${result.message}`)
          // Re-run diagnosis to update the UI
          await runDoctor()
        } else {
          setError(result?.message || 'Fix failed')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply fix')
      } finally {
        setApplyingFixId(null)
      }
    },
    [runDoctor]
  )

  const getStatusBadge = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    const colors = {
      healthy: 'success',
      degraded: 'warning',
      unhealthy: 'danger'
    }
    return (
      <Badge color={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const getCheckIcon = (status: 'pass' | 'warn' | 'fail') => {
    switch (status) {
      case 'pass':
        return <FontAwesomeIcon icon={faCheck} className="text-success" />
      case 'warn':
        return (
          <FontAwesomeIcon
            icon={faExclamationTriangle}
            className="text-warning"
          />
        )
      case 'fail':
        return <FontAwesomeIcon icon={faXmark} className="text-danger" />
    }
  }

  const getContainerStateBadge = (state: string) => {
    const colors: Record<string, string> = {
      running: 'success',
      stopped: 'secondary',
      created: 'info',
      exited: 'danger',
      paused: 'warning'
    }
    return <Badge color={colors[state] || 'secondary'}>{state}</Badge>
  }

  // Not in Keeper mode - show message
  if (!useKeeper || !shouldUseKeeper()) {
    return (
      <div className="animated fadeIn">
        <Card>
          <CardHeader>System Health</CardHeader>
          <CardBody>
            <Alert color="info">
              System health monitoring is only available when running with the
              Universal Installer (Keeper).
            </Alert>
          </CardBody>
        </Card>
      </div>
    )
  }

  return (
    <div className="animated fadeIn">
      {error && (
        <Alert color="danger" toggle={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Overall Health Status */}
      <Card className="mb-4">
        <CardHeader>
          <FontAwesomeIcon icon={faHeartPulse} className="me-2" />
          System Health
          {healthStatus && (
            <span className="float-end">
              {getStatusBadge(healthStatus.status)}
            </span>
          )}
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="text-center">
              <FontAwesomeIcon icon={faCircleNotch} spin size="2x" />
            </div>
          ) : healthStatus ? (
            <Row>
              <Col md={6}>
                <h6>Service Checks</h6>
                <Table size="sm" borderless>
                  <tbody>
                    <tr>
                      <td>Podman Socket</td>
                      <td className="text-end">
                        {healthStatus.checks.podmanSocket ? (
                          <Badge color="success">Connected</Badge>
                        ) : (
                          <Badge color="danger">Disconnected</Badge>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>SignalK Container</td>
                      <td className="text-end">
                        {healthStatus.checks.signalkContainer ? (
                          <Badge color="success">Running</Badge>
                        ) : (
                          <Badge color="danger">Not Running</Badge>
                        )}
                      </td>
                    </tr>
                    {healthStatus.checks.networkConnectivity !== undefined && (
                      <tr>
                        <td>Network Connectivity</td>
                        <td className="text-end">
                          {healthStatus.checks.networkConnectivity ? (
                            <Badge color="success">OK</Badge>
                          ) : (
                            <Badge color="warning">Limited</Badge>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Col>
              <Col md={6}>
                <h6>Keeper Info</h6>
                <Table size="sm" borderless>
                  <tbody>
                    <tr>
                      <td>Version</td>
                      <td className="text-end">{healthStatus.version}</td>
                    </tr>
                    <tr>
                      <td>Uptime</td>
                      <td className="text-end">
                        {formatUptime(healthStatus.uptime)}
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </Col>
            </Row>
          ) : (
            <p className="text-muted">Unable to load health status</p>
          )}
        </CardBody>
        <CardFooter>
          <Button
            color="secondary"
            size="sm"
            onClick={loadAllData}
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faSync} spin={isLoading} /> Refresh
          </Button>
        </CardFooter>
      </Card>

      {/* Doctor / Preflight Checks */}
      <Card className="mb-4">
        <CardHeader>
          <FontAwesomeIcon icon={faStethoscope} className="me-2" />
          System Doctor
          {doctorResult && (
            <span className="float-end">
              <Badge
                color={
                  doctorResult.overall === 'pass'
                    ? 'success'
                    : doctorResult.overall === 'warn'
                      ? 'warning'
                      : 'danger'
                }
              >
                {doctorResult.overall.toUpperCase()}
              </Badge>
            </span>
          )}
        </CardHeader>
        <CardBody>
          <p className="text-muted">
            Run a comprehensive system check to identify potential issues with
            your SignalK installation.
          </p>
          {doctorResult && (
            <Table size="sm" className="mt-3">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {doctorResult.checks.map((check) => (
                  <tr key={check.name}>
                    <td>{check.name}</td>
                    <td>{getCheckIcon(check.status)}</td>
                    <td>
                      {check.message}
                      {check.details && (
                        <small className="d-block text-muted">
                          {check.details}
                        </small>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {/* Issues with Fixes */}
          {doctorResult?.issues && doctorResult.issues.length > 0 && (
            <div className="mt-4">
              <h6>
                <FontAwesomeIcon
                  icon={faExclamationTriangle}
                  className="me-2 text-warning"
                />
                Issues Detected ({doctorResult.issues.length})
              </h6>
              {fixSuccess && (
                <Alert color="success" className="mt-2">
                  {fixSuccess}
                </Alert>
              )}
              {doctorResult.issues.map((issue) => (
                <Card
                  key={issue.id}
                  className={`mt-2 border-${issue.severity === 'critical' ? 'danger' : 'warning'}`}
                >
                  <CardBody className="py-2">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <strong
                          className={
                            issue.severity === 'critical'
                              ? 'text-danger'
                              : 'text-warning'
                          }
                        >
                          {issue.title}
                        </strong>
                        <p className="mb-1 small text-muted">
                          {issue.description}
                        </p>
                        <Badge color="secondary" className="me-1">
                          {issue.category}
                        </Badge>
                        <Badge
                          color={
                            issue.severity === 'critical' ? 'danger' : 'warning'
                          }
                        >
                          {issue.severity}
                        </Badge>
                      </div>
                      {issue.autoFixable && issue.fixes.length > 0 && (
                        <div>
                          {issue.fixes.map((fix) => (
                            <Button
                              key={fix.id}
                              color="success"
                              size="sm"
                              onClick={() => applyFix(fix.id, fix.title)}
                              disabled={applyingFixId === fix.id}
                              title={fix.description}
                            >
                              {applyingFixId === fix.id ? (
                                <FontAwesomeIcon icon={faCircleNotch} spin />
                              ) : (
                                <FontAwesomeIcon icon={faSync} />
                              )}{' '}
                              {fix.title}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </CardBody>
        <CardFooter>
          <Button
            color="primary"
            onClick={runDoctor}
            disabled={isRunningDoctor}
          >
            {isRunningDoctor ? (
              <FontAwesomeIcon icon={faCircleNotch} spin />
            ) : (
              <FontAwesomeIcon icon={faStethoscope} />
            )}{' '}
            Run Doctor Check
          </Button>
        </CardFooter>
      </Card>

      {/* Container Status */}
      {containerInfo && (
        <Card className="mb-4">
          <CardHeader>
            <FontAwesomeIcon icon={faServer} className="me-2" />
            Container Status
            <span className="float-end">
              {/* Running container badges */}
              <Badge color="primary" className="me-1">SignalK</Badge>
              {systemInfo?.keeper && (
                <Badge color="info" className="me-1">Keeper</Badge>
              )}
              {systemInfo?.memory?.influxdbMB && systemInfo.memory.influxdbMB > 0 && (
                <Badge color="warning" className="me-1">InfluxDB</Badge>
              )}
              {systemInfo?.memory?.grafanaMB && systemInfo.memory.grafanaMB > 0 && (
                <Badge color="success" className="me-1">Grafana</Badge>
              )}
            </span>
          </CardHeader>
          <CardBody>
            <Row>
              <Col md={6}>
                <Table size="sm" borderless>
                  <tbody>
                    <tr>
                      <td>SignalK Container</td>
                      <td className="text-end">{getContainerStateBadge(containerInfo.state)}</td>
                    </tr>
                    <tr>
                      <td>Image</td>
                      <td
                        className="text-end text-truncate"
                        style={{ maxWidth: '200px' }}
                      >
                        {containerInfo.image}
                      </td>
                    </tr>
                    {containerInfo.health && (
                      <tr>
                        <td>Health</td>
                        <td className="text-end">
                          <Badge
                            color={
                              containerInfo.health.status === 'healthy'
                                ? 'success'
                                : 'warning'
                            }
                          >
                            {containerInfo.health.status}
                          </Badge>
                        </td>
                      </tr>
                    )}
                    {systemInfo?.keeper && (
                      <tr>
                        <td>Keeper Version</td>
                        <td className="text-end">{systemInfo.keeper.version}</td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </Col>
              <Col md={6}>
                {/* CPU Usage */}
                {systemInfo?.cpu && (
                  <div className="mb-3">
                    <h6>CPU Usage</h6>
                    <div className="mb-1">
                      <small>
                        System: {systemInfo.cpu.systemPercent.toFixed(1)}% ({systemInfo.cpu.cpuCount} cores)
                      </small>
                      <Progress
                        value={systemInfo.cpu.systemPercent}
                        color="secondary"
                        style={{ height: '10px' }}
                      />
                    </div>
                    <div>
                      <small>
                        SignalK: {systemInfo.cpu.signalkPercent.toFixed(1)}%
                      </small>
                      <Progress
                        value={systemInfo.cpu.signalkPercent}
                        color="primary"
                        style={{ height: '10px' }}
                      />
                    </div>
                  </div>
                )}

                {/* Memory Usage */}
                <h6>System Memory Usage</h6>
                {systemInfo?.memory ? (
                  <>
                    <div className="mb-2">
                      <Progress multi style={{ height: '20px' }}>
                        <Progress
                          bar
                          color="primary"
                          value={(systemInfo.memory.signalkMB / systemInfo.memory.totalMB) * 100}
                        />
                        {systemInfo.memory.keeperMB > 0 && (
                          <Progress
                            bar
                            color="info"
                            value={(systemInfo.memory.keeperMB / systemInfo.memory.totalMB) * 100}
                          />
                        )}
                        {systemInfo.memory.influxdbMB > 0 && (
                          <Progress
                            bar
                            color="warning"
                            value={(systemInfo.memory.influxdbMB / systemInfo.memory.totalMB) * 100}
                          />
                        )}
                        {systemInfo.memory.grafanaMB > 0 && (
                          <Progress
                            bar
                            color="success"
                            value={(systemInfo.memory.grafanaMB / systemInfo.memory.totalMB) * 100}
                          />
                        )}
                      </Progress>
                    </div>
                    <small className="text-muted">
                      <Badge color="primary" className="me-1">SignalK: {systemInfo.memory.signalkMB} MB</Badge>
                      {systemInfo.memory.keeperMB > 0 && (
                        <Badge color="info" className="me-1">Keeper: {systemInfo.memory.keeperMB} MB</Badge>
                      )}
                      {systemInfo.memory.influxdbMB > 0 && (
                        <Badge color="warning" className="me-1">InfluxDB: {systemInfo.memory.influxdbMB} MB</Badge>
                      )}
                      {systemInfo.memory.grafanaMB > 0 && (
                        <Badge color="success" className="me-1">Grafana: {systemInfo.memory.grafanaMB} MB</Badge>
                      )}
                    </small>
                    <div className="mt-2">
                      <small className="text-muted">
                        Total: {systemInfo.memory.usedMB} MB / {systemInfo.memory.totalMB} MB ({systemInfo.memory.usedPercent}%)
                      </small>
                    </div>
                  </>
                ) : containerStats ? (
                  <>
                    <div className="mb-2">
                      <small>
                        CPU: {containerStats.cpu.percentage.toFixed(1)}%
                      </small>
                      <Progress
                        value={containerStats.cpu.percentage}
                        color="info"
                        className="mb-2"
                      />
                    </div>
                    <div className="mb-2">
                      <small>
                        Memory: {formatBytes(containerStats.memory.usage)} /{' '}
                        {formatBytes(containerStats.memory.limit)} (
                        {containerStats.memory.percentage.toFixed(1)}%)
                      </small>
                      <Progress
                        value={containerStats.memory.percentage}
                        color="primary"
                        className="mb-2"
                      />
                    </div>
                  </>
                ) : null}
                {containerStats && (
                  <small className="text-muted d-block mt-2">
                    Network: {formatBytes(containerStats.network.rxBytes)} rx /{' '}
                    {formatBytes(containerStats.network.txBytes)} tx
                  </small>
                )}
              </Col>
            </Row>
          </CardBody>
        </Card>
      )}

      {/* System Info */}
      {systemInfo && (
        <Card className="mb-4">
          <CardHeader>System Information</CardHeader>
          <CardBody>
            <Row>
              <Col md={6}>
                <Table size="sm" borderless>
                  <tbody>
                    <tr>
                      <td>OS</td>
                      <td className="text-end">{systemInfo.os}</td>
                    </tr>
                    <tr>
                      <td>Architecture</td>
                      <td className="text-end">{systemInfo.arch}</td>
                    </tr>
                    <tr>
                      <td>Hostname</td>
                      <td className="text-end">{systemInfo.hostname}</td>
                    </tr>
                  </tbody>
                </Table>
              </Col>
              <Col md={6}>
                <h6>Capabilities</h6>
                <Table size="sm" borderless>
                  <tbody>
                    <tr>
                      <td>D-Bus</td>
                      <td className="text-end">
                        {systemInfo.capabilities.dbus ? (
                          <Badge color="success">Available</Badge>
                        ) : (
                          <Badge color="secondary">Not Available</Badge>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>Bluetooth</td>
                      <td className="text-end">
                        {systemInfo.capabilities.bluetooth ? (
                          <Badge color="success">Available</Badge>
                        ) : (
                          <Badge color="secondary">Not Available</Badge>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>Serial Ports</td>
                      <td className="text-end">
                        {systemInfo.capabilities.serialPorts.length > 0 ? (
                          <Badge color="success">
                            {systemInfo.capabilities.serialPorts.length} found
                          </Badge>
                        ) : (
                          <Badge color="secondary">None</Badge>
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>CAN Interfaces (SocketCAN)</td>
                      <td className="text-end">
                        {systemInfo.capabilities.canInterfaces?.length > 0 ? (
                          <Badge color="success">
                            {systemInfo.capabilities.canInterfaces.length} found
                          </Badge>
                        ) : (
                          <Badge color="secondary">None</Badge>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </Table>
              </Col>
            </Row>
            {systemInfo.storage && (
              <div className="mt-3">
                <h6>Storage</h6>
                <small>
                  Used: {formatBytes(systemInfo.storage.used)} / Total:{' '}
                  {formatBytes(systemInfo.storage.total)}(
                  {(
                    (systemInfo.storage.used / systemInfo.storage.total) *
                    100
                  ).toFixed(1)}
                  %)
                </small>
                <Progress
                  value={
                    (systemInfo.storage.used / systemInfo.storage.total) * 100
                  }
                  color={
                    systemInfo.storage.available < 1073741824
                      ? 'danger'
                      : 'info'
                  }
                />
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

export default SystemHealth
