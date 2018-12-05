import React from 'react'
import { connect } from 'react-redux'
import { Card, CardBody, CardHeader, Progress, Row, Col, Table } from 'reactstrap'
import '../../fa-pulse.css'

const Dashboard = props => {
  const {
    deltaRate,
    numberOfAvailablePaths,
    wsClients,
    providerStatistics,
  } = props.serverStatistics || {
    deltaRate: 0,
    numberOfAvailablePaths: 0,
    wsClients: 0,
    providerStatistics: {},
  }
  const providerStatus = props.providerStatus || []
  const errorCount = providerStatus.filter(s => s.type === 'error').length
  let errors = ''
  if ( errorCount > 0 ) {
    errors = `(${errorCount} errors)`
  }
  return (
    <div className='animated fadeIn'>
      {props.websocketStatus === 'open' && (
        <div>
          <Card>
            <CardHeader>Stats</CardHeader>
            <CardBody>
              <Row>
                <Col xs='12' md='6'>
                  <div className='callout callout-primary'>
                    <small className='text-muted'>
                      Total server Signal K throughput (deltas/second)
                    </small>
                    <br />
                    <strong className='h4'>{deltaRate.toFixed(1)}</strong>
                  </div>
                  <div className='callout callout-primary'>
                    <small className='text-muted'>
                      Number of Signal K Paths
                    </small>
                    <br />
                    <strong className='h4'>{numberOfAvailablePaths}</strong>
                  </div>
                  <div className='callout callout-primary'>
                    <small className='text-muted'>
                      Number of WebSocket Clients
                    </small>
                    <br />
                    <strong className='h4'>{wsClients}</strong>
                  </div>
                </Col>
                <Col xs='12' md='6'>
                  <div className='text-muted'>
                    Provider activity (deltas/second)
                  </div>
                  <ul className='horizontal-bars type-2'>
                    {Object.keys(providerStatistics || {}).map(providerId => {
                      const providerStats = providerStatistics[providerId]
                      const iconClass =
                        'icon-feed text-primary' +
                        (providerStats.deltaRate > 50
                          ? ' fa-pulse-fast'
                         : providerStats.deltaRate > 0 ? ' fa-pulse' : '')
                      return (
                        <li key={providerId}>
                          <i className={iconClass} />
                          <span className='title'>{providerId}</span>
                          <span className='value'>
                            {' '}
                            {providerStats.deltaRate}{' '}
                            <span className='text-muted small'>
                              ({(
                                providerStats.deltaRate /
                                deltaRate *
                                100
                              ).toFixed(0)}%)
                            </span>
                          </span>
                          <div className='bars'>
                            <Progress
                              className='progress-xs'
                              color='warning'
                              value={providerStats.deltaRate / deltaRate * 100}
                            />
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </Col>
              </Row>
            </CardBody>
          </Card>

        <Card>
          <CardHeader>Provider & Plugin Status <p className='text-danger'>{errors}</p></CardHeader>
          <CardBody>
            <Row>
              <Col xs='12' md='12'>
              <Table hover responsive bordered striped size='sm'>
                <thead>
                  <tr>
                  <th>Id</th>
                  <th>Last Error</th>
                  <th>Status</th>
                  </tr>
                </thead>
                <tbody>
               {providerStatus.map(status => {
               let statusClass
               if ( status.type === 'status' ) {
                 statusClass = 'text-success'
               } else if ( status.type === 'warning' ) {
                 statusClass = 'text-warning'
               } else {
                 statusClass = 'text-danger'
               }
               const lastError = status.lastError && status.lastError != status.message ? status.lastErrorTimeStamp + ': ' + status.lastError : ''
               return (
                 <tr key={status.id}>
                 <td>{status.id}</td>
                 <td><p className='text-danger'>{lastError}</p></td>
                 <td><p className={statusClass}>{(status.message || '').substring(0,80)}{status.message.length > 80 ? '...' : ''}</p></td>
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
        <Card className='border-warning'>
          <CardHeader>Not connected to the server</CardHeader>
        </Card>
      )}
    </div>
  )
}

export default connect(({ serverStatistics, websocketStatus, providerStatus }) => ({
  serverStatistics,
  websocketStatus,
  providerStatus
}))(Dashboard)
