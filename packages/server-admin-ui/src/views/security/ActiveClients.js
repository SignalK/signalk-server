import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Card,
  CardHeader,
  CardBody,
  Table,
  Badge,
} from 'reactstrap'
import EnableSecurity from './EnableSecurity'

class ActiveClients extends Component {
  constructor(props) {
    super(props)
    this.state = {
      activeClients: [],
      loading: true,
      error: null,
    }

    this.fetchActiveClients = this.fetchActiveClients.bind(this)
    this.refreshData = this.refreshData.bind(this)
  }

  componentDidMount() {
    if (this.props.loginStatus.authenticationRequired) {
      this.fetchActiveClients()
      // Refresh every 5 seconds
      this.interval = setInterval(this.fetchActiveClients, 5000)
    }
  }

  componentWillUnmount() {
    if (this.interval) {
      clearInterval(this.interval)
    }
  }

  fetchActiveClients() {
    fetch(`${window.serverRoutesPrefix}/security/devices/active`, {
      credentials: 'include',
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        return response.json()
      })
      .then((data) => {
        this.setState({ 
          activeClients: data || [],
          loading: false,
          error: null,
        })
      })
      .catch((error) => {
        console.error('Error fetching active clients:', error)
        this.setState({ 
          loading: false, 
          error: error.message 
        })
      })
  }

  refreshData() {
    this.setState({ loading: true })
    this.fetchActiveClients()
  }

  formatConnectedTime(connectedAt) {
    if (!connectedAt) return 'Unknown'
    const now = new Date()
    const connected = new Date(connectedAt)
    const diffMs = now - connected
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h ago`
    if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m ago`
    if (diffMins > 0) return `${diffMins}m ago`
    return 'Just now'
  }

  render() {
    if (!this.props.loginStatus.authenticationRequired) {
      return <EnableSecurity />
    }

    const { activeClients, loading, error } = this.state

    return (
      <div className="animated fadeIn">
        <Card>
          <CardHeader>
            <i className="fa fa-wifi"></i> Active WebSocket Clients
            <div className="card-header-actions">
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={this.refreshData}
                disabled={loading}
              >
                <i className="fa fa-refresh"></i> Refresh
              </button>
            </div>
          </CardHeader>
          <CardBody>
            {error && (
              <div className="alert alert-danger" role="alert">
                Error loading active clients: {error}
              </div>
            )}
            
            {loading && (
              <div className="text-center">
                <i className="fa fa-spinner fa-spin"></i> Loading...
              </div>
            )}

            {!loading && !error && (
              <>
                <div className="mb-3">
                  <Badge color="info" className="mr-2">
                    {activeClients.length} active client{activeClients.length !== 1 ? 's' : ''}
                  </Badge>
                  <small className="text-muted">
                    Updates automatically every 5 seconds
                  </small>
                </div>

                {activeClients.length === 0 ? (
                  <div className="text-center text-muted">
                    <i className="fa fa-plug"></i>
                    <p>No active WebSocket clients connected</p>
                  </div>
                ) : (
                  <Table hover responsive striped size="sm">
                    <thead>
                      <tr>
                        <th>Device Name</th>
                        <th>Client ID</th>
                        <th>Remote Address</th>
                        <th>Connected</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeClients.map((client) => (
                        <tr key={client.clientId}>
                          <td>
                            <strong>
                              {client.description !== client.clientId 
                                ? client.description 
                                : <span className="text-muted">Unnamed Client</span>
                              }
                            </strong>
                            {client.userAgent && client.description !== client.clientId && (
                              <br />
                              <small className="text-muted" title={client.userAgent}>
                                {client.userAgent.length > 50 ? client.userAgent.substring(0, 50) + '...' : client.userAgent}
                              </small>
                            )}
                          </td>
                          <td>
                            <code className="text-small">{client.clientId}</code>
                          </td>
                          <td>
                            <span className="text-muted">{client.remoteAddress}</span>
                          </td>
                          <td>
                            {this.formatConnectedTime(client.connectedAt)}
                          </td>
                          <td>
                            <Badge color="success">
                              <i className="fa fa-circle"></i> Active
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    )
  }
}

function mapStateToProps(state) {
  return {
    loginStatus: state.loginStatus,
  }
}

export default connect(mapStateToProps)(ActiveClients)