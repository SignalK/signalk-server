import { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardBody,
  CardHeader,
  Progress,
  Row,
  Col,
  Table
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSignIn } from '@fortawesome/free-solid-svg-icons/faSignIn'
import { faSignOut } from '@fortawesome/free-solid-svg-icons/faSignOut'
import { useAppSelector } from '../../store'
import type { ProviderStatistics } from '../../store/types'
import '../../fa-pulse.css'

interface ProviderStatusItem {
  id: string
  type?: string
  statusType?: string
  message?: string
  lastError?: string
  lastErrorTimeStamp?: string
}

export default function Dashboard() {
  const serverStatistics = useAppSelector((state) => state.serverStatistics)
  const websocketStatus = useAppSelector((state) => state.websocketStatus)
  const providerStatus =
    (useAppSelector((state) => state.providerStatus) as ProviderStatusItem[]) ||
    []
  const navigate = useNavigate()

  const deltaRate = serverStatistics?.deltaRate ?? 0
  const numberOfAvailablePaths = serverStatistics?.numberOfAvailablePaths ?? 0
  const wsClients = serverStatistics?.wsClients ?? 0
  const providerStatistics: Record<string, ProviderStatistics> =
    serverStatistics?.providerStatistics ?? {}
  const uptime = serverStatistics?.uptime ?? 0

  const errorCount = providerStatus.filter((s) => s.type === 'error').length
  const uptimeNum = typeof uptime === 'number' ? uptime : 0
  const uptimeD = Math.floor(uptimeNum / (60 * 60 * 24))
  const uptimeH = Math.floor((uptimeNum % (60 * 60 * 24)) / (60 * 60))
  const uptimeM = Math.floor((uptimeNum % (60 * 60)) / 60)
  const deltaRateNum = typeof deltaRate === 'number' ? deltaRate : 0
  let errors = ''
  if (errorCount > 0) {
    errors = `(${errorCount} errors)`
  }

  const getLinkType = (providerId: string): string => {
    try {
      return (
        providerStatus.find((item) => item.id === providerId)?.statusType ||
        'provider'
      )
    } catch (_) {
      return 'provider'
    }
  }

  const getInputPulseClass = (providerStats: ProviderStatistics): string => {
    if ((providerStats.deltaRate || 0) > 50) return 'text-primary fa-pulse-fast'
    if ((providerStats.deltaRate || 0) > 0) return 'text-primary fa-pulse'
    return ''
  }

  const getOutputPulseClass = (providerStats: ProviderStatistics): string => {
    if ((providerStats.writeRate || 0) > 50) return 'text-primary fa-pulse-fast'
    if ((providerStats.writeRate || 0) > 0) return 'text-primary fa-pulse'
    return ''
  }

  const renderActivity = (
    providerId: string,
    providerStats: ProviderStatistics,
    linkType: string
  ): ReactNode => {
    const iconStyle = {
      fontSize: '18px',
      marginLeft: '5px',
      marginRight: '8px'
    }
    return (
      <li key={providerId} onClick={() => navigate(`/dashboard`)}>
        <FontAwesomeIcon
          icon={faSignIn}
          className={getInputPulseClass(providerStats)}
          style={{
            ...iconStyle,
            color: providerStats.deltaCount ? '#039' : 'lightblue'
          }}
        />
        <FontAwesomeIcon
          icon={faSignOut}
          className={getOutputPulseClass(providerStats)}
          style={{
            ...iconStyle,
            color: providerStats.writeCount ? '#039' : 'lightblue'
          }}
        />
        <span className="title">
          {linkType === 'plugin'
            ? pluginNameLink(providerId)
            : providerIdLink(providerId)}
        </span>
        {(providerStats.writeRate || 0) > 0 && (
          <span className="value" style={{ fontWeight: 'normal' }}>
            {' '}
            <strong>{providerStats.writeRate}</strong>{' '}
            <span className="text-muted small">{'msg/s'}</span>{' '}
          </span>
        )}
        {(providerStats.deltaRate || 0) > 0 &&
          (providerStats.writeRate || 0) > 0 && (
            <span className="value" style={{ fontWeight: 'normal' }}>
              <span className="text-muted small">{','}</span>
              &#160;
            </span>
          )}
        {(providerStats.deltaRate || 0) > 0 && (
          <span className="value" style={{ fontWeight: 'normal' }}>
            {' '}
            <strong>{providerStats.deltaRate}</strong>{' '}
            <span className="text-muted small">
              (
              {(((providerStats.deltaRate || 0) / deltaRateNum) * 100).toFixed(
                0
              )}
              %)
            </span>{' '}
            <span className="text-muted small">{'deltas/s'}</span>{' '}
          </span>
        )}
        <div className="bars">
          <Progress
            className="progress-xs"
            color="warning"
            value={((providerStats.deltaRate || 0) / deltaRateNum) * 100}
          />
        </div>
      </li>
    )
  }

  const renderStatus = (
    status: ProviderStatusItem,
    statusClass: string,
    lastError: string
  ): ReactNode => {
    return (
      <tr
        key={status.id}
        onClick={() => {
          navigate(
            '/serverConfiguration/' +
              (status.statusType === 'plugin' ? 'plugins/' : 'connections/') +
              status.id
          )
        }}
      >
        <td>
          {status.statusType === 'plugin'
            ? pluginNameLink(status.id)
            : providerIdLink(status.id)}
        </td>
        <td>
          <p className="text-danger">{lastError}</p>
        </td>
        <td>
          <p className={statusClass}>
            {(status.message || '').substring(0, 80)}
            {(status.message || '').length > 80 ? '...' : ''}
          </p>
        </td>
      </tr>
    )
  }

  return (
    <div className="animated fadeIn">
      {websocketStatus === 'open' && (
        <div>
          <Card>
            <CardHeader>Stats</CardHeader>
            <CardBody>
              <Row>
                <Col xs="12" md="6">
                  <div className="callout callout-primary">
                    <small className="text-muted">
                      Total server Signal K throughput (deltas/second)
                    </small>
                    <br />
                    <strong className="h4">{deltaRateNum.toFixed(1)}</strong>
                  </div>
                  <div className="callout callout-primary">
                    <small className="text-muted">
                      Number of Signal K Paths
                    </small>
                    <br />
                    <strong className="h4">{numberOfAvailablePaths}</strong>
                  </div>
                  <div className="callout callout-primary">
                    <small className="text-muted">
                      Number of WebSocket Clients
                    </small>
                    <br />
                    <strong className="h4">{wsClients}</strong>
                  </div>
                  <div className="callout callout-primary">
                    <small className="text-muted">Uptime</small>
                    <br />
                    <strong className="h5">
                      {uptimeD} days, {uptimeH} hours, {uptimeM} minutes
                    </strong>
                  </div>
                </Col>
                <Col xs="12" md="6">
                  <div className="text-muted" style={{ fontSize: '1rem' }}>
                    Connections activity
                  </div>
                  <ul className="horizontal-bars type-2">
                    {Object.keys(providerStatistics || {})
                      .sort()
                      .map((providerId) => {
                        if (getLinkType(providerId) === 'provider') {
                          return renderActivity(
                            providerId,
                            providerStatistics[providerId],
                            'provider'
                          )
                        }
                        return null
                      })}
                  </ul>
                  <br></br>
                  <div className="text-muted" style={{ fontSize: '1rem' }}>
                    {Object.keys(providerStatistics || {}).some(
                      (providerId) => getLinkType(providerId) === 'plugin'
                    )
                      ? 'Plugins activity'
                      : null}
                  </div>
                  <ul className="horizontal-bars type-2">
                    {Object.keys(providerStatistics || {})
                      .sort()
                      .map((providerId) => {
                        if (getLinkType(providerId) === 'plugin') {
                          return renderActivity(
                            providerId,
                            providerStatistics[providerId],
                            'plugin'
                          )
                        }
                        return null
                      })}
                  </ul>
                </Col>
              </Row>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              Connection & Plugin Status <p className="text-danger">{errors}</p>
            </CardHeader>
            <CardBody>
              <Row>
                <Col xs="12" md="12">
                  <Table hover responsive bordered striped size="sm">
                    <thead>
                      <tr>
                        <th>Id</th>
                        <th>Last Error</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providerStatus.map((status) => {
                        const statusClasses: Record<string, string> = {
                          status: 'text-success',
                          warning: 'text-warning',
                          error: 'text-danger'
                        }
                        const statusClass =
                          statusClasses[status.type || ''] || ''
                        const lastError =
                          status.lastError &&
                          status.lastError !== status.message
                            ? status.lastErrorTimeStamp +
                              ': ' +
                              status.lastError
                            : ''
                        return renderStatus(status, statusClass, lastError)
                      })}
                    </tbody>
                  </Table>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </div>
      )}

      {websocketStatus === 'closed' && (
        <Card className="border-warning">
          <CardHeader>Not connected to the server</CardHeader>
        </Card>
      )}
    </div>
  )
}

function pluginNameLink(id: string): ReactNode {
  return <a href={'#/serverConfiguration/plugins/' + id}>{id}</a>
}

function providerIdLink(id: string): ReactNode {
  if (id === 'defaults') {
    return <a href={'#/serverConfiguration/settings'}>{id}</a>
  } else if (id.startsWith('ws.')) {
    return <a href={'#/security/devices'}>{id}</a>
  } else {
    return <a href={'#/serverConfiguration/connections/' + id}>{id}</a>
  }
}
