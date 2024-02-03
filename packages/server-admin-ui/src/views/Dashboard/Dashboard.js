import React from 'react'
import { connect } from 'react-redux'
import {
  Card,
  CardBody,
  CardHeader,
  Progress,
  Row,
  Col,
  Table,
} from 'reactstrap'
import '../../fa-pulse.css'

const Dashboard = (props) => {
  const {
    deltaRate,
    numberOfAvailablePaths,
    wsClients,
    providerStatistics,
    uptime,
  } = props.serverStatistics || {
    deltaRate: 0,
    numberOfAvailablePaths: 0,
    wsClients: 0,
    providerStatistics: {},
    uptime: '',
  }
  const providerStatus = props.providerStatus || []
  const errorCount = providerStatus.filter((s) => s.type === 'error').length
  const uptimeD = Math.floor(uptime / (60 * 60 * 24))
  const uptimeH = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60))
  const uptimeM = Math.floor((uptime % (60 * 60)) / 60)
  let errors = ''
  if (errorCount > 0) {
    errors = `(${errorCount} errors)`
  }
  return (
    <div className="animated fadeIn">
      {props.websocketStatus === 'open' && (
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
                  <div className="text-muted">Connections activity</div>
                  <ul className="horizontal-bars type-2">
                    {Object.keys(providerStatistics || {}).sort().map((providerId) => {
                      const providerStats = providerStatistics[providerId]
                      let linkType = 'provider'
                      try {
                        linkType = providerStatus.find(
                          (item) => item.id === providerId
                        ).statusType
                      } catch (error) {}
                      const inputPulseIconClass =
                        'icon-login' +
                        (providerStats.deltaRate > 50
                          ? ' text-primary fa-pulse-fast'
                          : providerStats.deltaRate > 0
                          ? ' text-primary fa-pulse'
                          : '')
                      const outputPulseIconClass =
                        'icon-logout' +
                        (providerStats.writeRate > 50
                          ? ' text-primary fa-pulse-fast'
                          : providerStats.writeRate > 0
                          ? ' text-primary fa-pulse'
                          : '')
                      if (linkType === 'provider') {
                        return (
                          <li
                            key={providerId}
                            onClick={() =>
                              props.history.push(
                                `/serverConfiguration/providers/${providerId}`
                              )
                            }
                          >
                            <i
                              className={inputPulseIconClass}
                              style={{
                                color: providerStats.deltaCount
                                  ? '#039'
                                  : 'lightblue',
                              }}
                            />
                            <i
                              className={outputPulseIconClass}
                              style={{
                                transform: 'scaleX(-1)',
                                color: providerStats.writeCount
                                  ? '#039'
                                  : 'lightblue',
                              }}
                            />
                            <span className="title">
                              {providerIdLink(providerId)}
                            </span>
                            {providerStats.writeRate > 0 && (
                              <span className="value">
                                {' '}
                                {providerStats.writeRate}{' '}
                                <span className="text-muted small">
                                  {'msg/s'}
                                </span>{' '}
                              </span>
                            )}
                            {providerStats.deltaRate > 0 &&
                              providerStats.writeRate > 0 && (
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
                                  (
                                  {(
                                    (providerStats.deltaRate / deltaRate) *
                                    100
                                  ).toFixed(0)}
                                  %)
                                </span>{' '}
                                <span className="text-muted small">
                                  {'deltas/s'}
                                </span>{' '}
                              </span>
                            )}
                            <div className="bars">
                              <Progress
                                className="progress-xs"
                                color="warning"
                                value={
                                  (providerStats.deltaRate / deltaRate) * 100
                                }
                              />
                            </div>
                          </li>
                        )
                      }
                    })}
                  </ul>
                  <br></br> 
                  <div className="text-muted">Plugins activity</div>
                  <ul className="horizontal-bars type-2">
                    {Object.keys(providerStatistics || {}).sort().map((providerId) => {
                      const providerStats = providerStatistics[providerId]
                      let linkType = 'provider'
                      try {
                        linkType = providerStatus.find(
                          (item) => item.id === providerId
                        ).statusType
                      } catch (error) {}
                      const inputPulseIconClass =
                        'icon-login' +
                        (providerStats.deltaRate > 50
                          ? ' text-primary fa-pulse-fast'
                          : providerStats.deltaRate > 0
                          ? ' text-primary fa-pulse'
                          : '')
                      const outputPulseIconClass =
                        'icon-logout' +
                        (providerStats.writeRate > 50
                          ? ' text-primary fa-pulse-fast'
                          : providerStats.writeRate > 0
                          ? ' text-primary fa-pulse'
                          : '')
                      if (linkType === 'plugin') {
                        return (
                          <li
                            key={providerId}
                            onClick={() =>
                              props.history.push(
                                `/serverConfiguration/providers/${providerId}`
                              )
                            }
                          >
                            <i
                              className={inputPulseIconClass}
                              style={{
                                color: providerStats.deltaCount
                                  ? '#039'
                                  : 'lightblue',
                              }}
                            />
                            <i
                              className={outputPulseIconClass}
                              style={{
                                transform: 'scaleX(-1)',
                                color: providerStats.writeCount
                                  ? '#039'
                                  : 'lightblue',
                              }}
                            />
                            <span className="title">
                              {pluginNameLink(providerId)}
                            </span>
                            {providerStats.writeRate > 0 && (
                              <span className="value">
                                {' '}
                                {providerStats.writeRate}{' '}
                                <span className="text-muted small">
                                  {'msg/s'}
                                </span>{' '}
                              </span>
                            )}
                            {providerStats.deltaRate > 0 &&
                              providerStats.writeRate > 0 && (
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
                                  (
                                  {(
                                    (providerStats.deltaRate / deltaRate) *
                                    100
                                  ).toFixed(0)}
                                  %)
                                </span>{' '}
                                <span className="text-muted small">
                                  {'deltas/s'}
                                </span>{' '}
                              </span>
                            )}
                            <div className="bars">
                              <Progress
                                className="progress-xs"
                                color="warning"
                                value={
                                  (providerStats.deltaRate / deltaRate) * 100
                                }
                              />
                            </div>
                          </li>
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
                        let statusClass
                        if (status.type === 'status') {
                          statusClass = 'text-success'
                        } else if (status.type === 'warning') {
                          statusClass = 'text-warning'
                        } else {
                          statusClass = 'text-danger'
                        }
                        const lastError =
                          status.lastError && status.lastError != status.message
                            ? status.lastErrorTimeStamp +
                              ': ' +
                              status.lastError
                            : ''
                        return (
                          <tr
                            key={status.id}
                            onClick={() => {
                              props.history.push(
                                '/serverConfiguration/' +
                                  (status.statusType === 'plugin'
                                    ? 'plugins/'
                                    : 'connections/') +
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
                      })}
                    </tbody>
                  </Table>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </div>
      )}

      {props.websocketStatus === 'closed' && (
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
  return <a href={'#/serverConfiguration/connections/' + id}>{id}</a>
}

export default connect(
  ({ serverStatistics, websocketStatus, providerStatus }) => ({
    serverStatistics,
    websocketStatus,
    providerStatus,
  })
)(Dashboard)
