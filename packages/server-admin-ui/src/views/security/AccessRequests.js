import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Col,
  Label,
  FormGroup,
  FormText,
  Table,
  Row,
  Badge
} from 'reactstrap'
import EnableSecurity from './EnableSecurity'

class AccessRequests extends Component {
  constructor(props) {
    super(props)
    this.state = {
      selectedRequest: null,
      accessRequestsApproving: [],
      accessRequestsDenying: []
    }
    this.handleRequestChange = this.handleRequestChange.bind(this)
  }

  handleAccessRequest(identifier, approved) {
    var stateKey = approved
      ? 'accessRequestsApproving'
      : 'accessRequestsDenying'
    this.state[stateKey].push(identifier)
    this.setState({ stateKey: this.state })

    var payload = {
      permissions: this.state.selectedRequest.permissions || 'readonly',
      config: this.state.selectedRequest.config,
      expiration: this.state.selectedRequest.expiration || '1y'
    }

    fetch(
      `${window.serverRoutesPrefix}/security/access/requests/${identifier}/${
        approved ? 'approved' : 'denied'
      }`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )
      .then((response) => response.text())
      .then(() => {
        this.state[stateKey] = this.state[stateKey].filter(
          (id) => id !== identifier
        )
        this.setState({
          stateKey: this.state[stateKey],
          selectedRequest: null
        })
      })
  }

  requestClicked(event, request, index) {
    this.setState(
      {
        selectedRequest: JSON.parse(JSON.stringify(request)),
        selectedIndex: index
      },
      () => {
        this.refs['selectedRequest'].scrollIntoView()
      }
    )
  }

  handleRequestChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.selectedRequest[event.target.name] = value
    this.setState({
      selectedRequest: this.state.selectedRequest
    })
  }
  handleCancel() {
    this.setState({ selectedRequest: null })
  }

  render() {
    return (
      <div className="animated fadeIn">
        {this.props.loginStatus.authenticationRequired === false && (
          <EnableSecurity />
        )}
        {this.props.loginStatus.authenticationRequired && (
          <div>
            <Card>
              <CardHeader>
                <i className="fa fa-align-justify"></i>Access Requests
              </CardHeader>
              <CardBody>
                <Table hover responsive bordered striped size="sm">
                  <thead>
                    <tr>
                      <th>Permissions</th>
                      <th>Identifier</th>
                      <th>Description</th>
                      <th>Source IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(this.props.accessRequests || []).map((req, index) => {
                      return (
                        <tr
                          key={req.accessIdentifier}
                          onClick={this.requestClicked.bind(
                            this,
                            event,
                            req,
                            index
                          )}
                        >
                          <td>
                            {req.permissions === 'admin' ? (
                              <Badge color="danger">Admin</Badge>
                            ) : req.permissions === 'readwrite' ? (
                              <Badge color="warning">Read/Write</Badge>
                            ) : (
                              <Badge color="secondary">Read Only</Badge>
                            )}
                          </td>
                          <td>{req.accessIdentifier}</td>
                          <td>{req.accessDescription}</td>
                          <td>{req.ip}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </CardBody>
            </Card>

            {this.state.selectedRequest && (
              <div ref="selectedRequest">
                <Card>
                  <CardHeader>
                    <i className="fa fa-align-justify"></i>Request
                  </CardHeader>
                  <CardBody>
                    <FormGroup row>
                      <Col md="4" lg="2">
                        <Label>Identifier</Label>
                      </Col>
                      <Col xs="12" md="8">
                        <Label>
                          {this.state.selectedRequest.accessIdentifier}
                        </Label>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="4" lg="2">
                        <Label>Description</Label>
                      </Col>
                      <Col xs="12" md="8">
                        <Label>
                          {this.state.selectedRequest.accessDescription}
                        </Label>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="4" lg="2">
                        <Label htmlFor="text-input">
                          Authentication Timeout
                        </Label>
                      </Col>
                      <Col xs="12" md="8" lg="3">
                        <Input
                          type="text"
                          name="expiration"
                          onChange={this.handleRequestChange}
                          value={this.state.selectedRequest.expiration}
                        />
                        <FormText color="muted">
                          Examples: 60s, 1m, 1h, 1d, NEVER
                        </FormText>
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="4" lg="2">
                        <Label htmlFor="select">Permissions</Label>
                      </Col>
                      <Col xs="12" md="8" lg="3">
                        {!this.state.selectedRequest.requestedPermissions && (
                          <Input
                            type="select"
                            name="permissions"
                            value={this.state.selectedRequest.permissions}
                            onChange={this.handleRequestChange}
                          >
                            <option value="readonly">Read Only</option>
                            <option value="readwrite">Read/Write</option>
                            <option value="admin">Admin</option>
                          </Input>
                        )}
                        {this.state.selectedRequest.requestedPermissions && (
                          <Label>
                            {this.state.selectedRequest.permissions ===
                            'admin' ? (
                              <Badge
                                color="danger"
                                style={{ fontSize: 'large' }}
                              >
                                Admin
                              </Badge>
                            ) : this.state.selectedRequest.permissions ===
                              'readwrite' ? (
                              <Badge
                                color="warning"
                                style={{ fontSize: 'large' }}
                              >
                                Read/Write
                              </Badge>
                            ) : (
                              <Badge
                                color="secondary"
                                style={{ fontSize: 'large' }}
                              >
                                Read Only
                              </Badge>
                            )}
                          </Label>
                        )}
                      </Col>
                    </FormGroup>
                  </CardBody>
                  <CardFooter>
                    <Row
                      className={
                        'ml-0 mr-0 d-flex justify-content-between justify-content-sm-start'
                      }
                    >
                      <Col xs="4" md="4" lg="2" className={'pl-0 pr-0 pr-md-2'}>
                        <Button
                          size="md"
                          color="success"
                          onClick={this.handleAccessRequest.bind(
                            this,
                            this.state.selectedRequest.accessIdentifier,
                            true
                          )}
                        >
                          <i
                            className={
                              this.state.accessRequestsApproving.indexOf(
                                this.state.selectedRequest.accessIdentifier
                              ) !== -1
                                ? 'fa fa-spinner fa-spin'
                                : 'fa fa-check'
                            }
                          ></i>{' '}
                          Approve
                        </Button>
                      </Col>
                      <Col
                        xs="4"
                        md="8"
                        lg="3"
                        className={'pl-2 pl-lg-1 pr-0 pr-md-2'}
                      >
                        <Button
                          size="md"
                          color="danger"
                          className="float-right float-sm-left"
                          onClick={this.handleAccessRequest.bind(
                            this,
                            this.state.selectedRequest.accessIdentifier,
                            false
                          )}
                        >
                          <i
                            className={
                              this.state.accessRequestsDenying.indexOf(
                                this.state.selectedRequest.accessIdentifier
                              ) !== -1
                                ? 'fa fa-spinner fa-spin'
                                : 'fa fa-ban'
                            }
                          ></i>{' '}
                          Deny
                        </Button>
                      </Col>
                    </Row>
                  </CardFooter>
                </Card>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }
}

const mapStateToProps = ({ accessRequests, loginStatus }) => ({
  accessRequests,
  loginStatus
})

export default connect(mapStateToProps)(AccessRequests)
