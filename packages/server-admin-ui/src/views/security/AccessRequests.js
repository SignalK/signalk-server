import React, { useState, useRef } from 'react'
import { useSelector } from 'react-redux'
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

const AccessRequests = () => {
  const accessRequests = useSelector((state) => state.accessRequests)
  const loginStatus = useSelector((state) => state.loginStatus)

  const [selectedRequest, setSelectedRequest] = useState(null)
  const [accessRequestsApproving, setAccessRequestsApproving] = useState([])
  const [accessRequestsDenying, setAccessRequestsDenying] = useState([])
  const selectedRequestRef = useRef(null)

  const handleAccessRequest = (identifier, approved) => {
    if (approved) {
      setAccessRequestsApproving((prev) => [...prev, identifier])
    } else {
      setAccessRequestsDenying((prev) => [...prev, identifier])
    }

    const payload = {
      permissions: selectedRequest.permissions || 'readonly',
      config: selectedRequest.config,
      expiration: selectedRequest.expiration || '1y'
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
        if (approved) {
          setAccessRequestsApproving((prev) =>
            prev.filter((id) => id !== identifier)
          )
        } else {
          setAccessRequestsDenying((prev) =>
            prev.filter((id) => id !== identifier)
          )
        }
        setSelectedRequest(null)
      })
  }

  const requestClicked = (request) => {
    setSelectedRequest(JSON.parse(JSON.stringify(request)))
    setTimeout(() => {
      selectedRequestRef.current?.scrollIntoView()
    }, 0)
  }

  const handleRequestChange = (event) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setSelectedRequest((prev) => ({
      ...prev,
      [event.target.name]: value
    }))
  }

  return (
    <div className="animated fadeIn">
      {loginStatus.authenticationRequired === false && <EnableSecurity />}
      {loginStatus.authenticationRequired && (
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
                  {(accessRequests || []).map((req) => {
                    return (
                      <tr
                        key={req.accessIdentifier}
                        onClick={() => requestClicked(req)}
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

          {selectedRequest && (
            <div ref={selectedRequestRef}>
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
                      <Label>{selectedRequest.accessIdentifier}</Label>
                    </Col>
                  </FormGroup>
                  <FormGroup row>
                    <Col md="4" lg="2">
                      <Label>Description</Label>
                    </Col>
                    <Col xs="12" md="8">
                      <Label>{selectedRequest.accessDescription}</Label>
                    </Col>
                  </FormGroup>
                  <FormGroup row>
                    <Col md="4" lg="2">
                      <Label htmlFor="text-input">Authentication Timeout</Label>
                    </Col>
                    <Col xs="12" md="8" lg="3">
                      <Input
                        type="text"
                        name="expiration"
                        onChange={handleRequestChange}
                        value={selectedRequest.expiration || ''}
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
                      {!selectedRequest.requestedPermissions && (
                        <Input
                          type="select"
                          name="permissions"
                          value={selectedRequest.permissions || 'readonly'}
                          onChange={handleRequestChange}
                        >
                          <option value="readonly">Read Only</option>
                          <option value="readwrite">Read/Write</option>
                          <option value="admin">Admin</option>
                        </Input>
                      )}
                      {selectedRequest.requestedPermissions && (
                        <Label>
                          {selectedRequest.permissions === 'admin' ? (
                            <Badge color="danger" style={{ fontSize: 'large' }}>
                              Admin
                            </Badge>
                          ) : selectedRequest.permissions === 'readwrite' ? (
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
                      'ms-0 me-0 d-flex justify-content-between justify-content-sm-start'
                    }
                  >
                    <Col xs="4" md="4" lg="2" className={'ps-0 pe-0 pe-md-2'}>
                      <Button
                        size="md"
                        color="success"
                        onClick={() =>
                          handleAccessRequest(
                            selectedRequest.accessIdentifier,
                            true
                          )
                        }
                      >
                        <i
                          className={
                            accessRequestsApproving.indexOf(
                              selectedRequest.accessIdentifier
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
                      className={'ps-2 ps-lg-1 pe-0 pe-md-2'}
                    >
                      <Button
                        size="md"
                        color="danger"
                        className="float-end float-sm-start"
                        onClick={() =>
                          handleAccessRequest(
                            selectedRequest.accessIdentifier,
                            false
                          )
                        }
                      >
                        <i
                          className={
                            accessRequestsDenying.indexOf(
                              selectedRequest.accessIdentifier
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

export default AccessRequests
