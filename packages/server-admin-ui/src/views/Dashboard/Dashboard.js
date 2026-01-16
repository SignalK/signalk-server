import React from 'react'
import { useSelector } from 'react-redux'
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
import '../../fa-pulse.css'

const Dashboard = () => {
  const serverStatistics = useSelector((state) => state.serverStatistics)
  const websocketStatus = useSelector((state) => state.websocketStatus)
  const providerStatus = useSelector((state) => state.providerStatus) || []
  const navigate = useNavigate()

  const {
    deltaRate,
    numberOfAvailablePaths,
    wsClients,
    providerStatistics,
    uptime
  } = serverStatistics || {
    deltaRate: 0,
    numberOfAvailablePaths: 0,
    wsClients: 0,
    providerStatistics: {},
    uptime: ''
  }
  const errorCount = providerStatus.filter((s) => s.type === 'error').length
  const uptimeD = Math.floor(uptime / (60 * 60 * 24))
  const uptimeH = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60))
  const uptimeM = Math.floor((uptime % (60 * 60)) / 60)
  let errors = ''
  if (errorCount > 0) {
    errors = `(${errorCount} errors)`
  }

  const getLinkType = (providerId) => {
    try {
      return providerStatus.find((item) => item.id === providerId).statusType
    } catch (_) {
      return 'provider'
    }
  }

  const inputPulseIconClass = (providerStats) => {
    return (
      'icon-login' +
      (providerStats.deltaRate > 50
        ? ' text-primary fa-pulse-fast'
        : providerStats.deltaRate > 0
          ? ' text-primary fa-pulse'
          : '')
    )
  }

  const outputPulseIconClass = (providerStats) => {
    return (
      'icon-logout' +
      (providerStats.writeRate > 50
        ? ' text-primary fa-pulse-fast'
        : providerStats.writeRate > 0
          ? ' text-primary fa-pulse'
          : '')
    )
  }

  const renderActivity = (providerId, providerStats, linkType) => {
    return (
      <li key={providerId} onClick={() => navigate(`/dashboard`)}>
        <i
          className={inputPulseIconClass(providerStats)}
          style={{
            color: providerStats.deltaCount ? '#039' : 'lightblue'
          }}
        />
        <i
          className={outputPulseIconClass(providerStats)}
          style={{
            transform: 'scaleX(-1)',
            color: providerStats.writeCount ? '#039' : 'lightblue'
          }}
        />
        <span className="title">
          {linkType === 'plugin'
            ? pluginNameLink(providerId)
            : providerIdLink(providerId)}
        </span>
        {providerStats.writeRate > 0 && (
          <span className="value">
            {' '}
            {providerStats.writeRate}{' '}
            <span className="text-muted small">{'msg/s'}</span>{' '}
          </span>
        )}
        {providerStats.deltaRate > 0 && providerStats.writeRate > 0 && (
          <span className="value">
            <span className="text-muted small">{','}</span>
            &#160;
          </span>
        )}
        {providerStats.deltaRate > 0 && (
          <span className="value">
            {' '}
            {providerStats.deltaRate}{' '}
            <span className="text-muted small">
              ({((providerStats.deltaRate / deltaRate) * 100).toFixed(0)}
              %)
            </span>{' '}
            <span className="text-muted small">{'deltas/s'}</span>{' '}
          </span>
        )}
        <div className="bars">
          <Progress
            className="progress-xs"
            color="warning"
            value={(providerStats.deltaRate / deltaRate) * 100}
          />
        </div>
      </li>
    )
  }

  const renderStatus = (status, statusClass, lastError) => {
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
            {status.message.length > 80 ? '...' : ''}
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
                    <strong className="h4">{deltaRate.toFixed(1)}</strong>
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
                        const statusClasses = {
                          status: 'text-success',
                          warning: 'text-warning',
                          error: 'text-danger'
                        }
                        const statusClass = statusClasses[status.type]
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

function pluginNameLink(id) {
  return <a href={'#/serverConfiguration/plugins/' + id}>{id}</a>
}

function providerIdLink(id) {
  if (id === 'defaults') {
    return <a href={'#/serverConfiguration/settings'}>{id}</a>
  } else if (id.startsWith('ws.')) {
    return <a href={'#/security/devices'}>{id}</a>
  } else {
    return <a href={'#/serverConfiguration/connections/' + id}>{id}</a>
  }
}

export default Dashboard
