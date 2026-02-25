import {
  useState,
  useRef,
  useOptimistic,
  useCallback,
  ChangeEvent
} from 'react'
import { useLoginStatus, useAccessRequests } from '../../store'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Table from 'react-bootstrap/Table'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import EnableSecurity from './EnableSecurity'

interface AccessRequestData {
  accessIdentifier: string
  accessDescription?: string
  ip?: string
  permissions?: 'readonly' | 'readwrite' | 'admin'
  requestedPermissions?: string
  expiration?: string
  config?: unknown
}

interface ProcessingState {
  approving: Set<string>
  denying: Set<string>
}

export default function AccessRequests() {
  const accessRequests = useAccessRequests() as unknown as AccessRequestData[]
  const loginStatus = useLoginStatus()

  const [selectedRequest, setSelectedRequest] =
    useState<AccessRequestData | null>(null)
  const selectedRequestRef = useRef<HTMLDivElement>(null)

  const [processing, setProcessing] = useState<ProcessingState>(() => ({
    approving: new Set(),
    denying: new Set()
  }))

  const [optimisticRequests, removeOptimisticRequest] = useOptimistic(
    accessRequests,
    (currentRequests: AccessRequestData[], identifierToRemove: string) =>
      currentRequests.filter((r) => r.accessIdentifier !== identifierToRemove)
  )

  const handleAccessRequest = useCallback(
    async (identifier: string, approved: boolean) => {
      setProcessing((prev) => ({
        approving: approved
          ? new Set([...prev.approving, identifier])
          : prev.approving,
        denying: !approved
          ? new Set([...prev.denying, identifier])
          : prev.denying
      }))

      const payload = {
        permissions: selectedRequest?.permissions || 'readonly',
        config: selectedRequest?.config,
        expiration: selectedRequest?.expiration || '1y'
      }

      try {
        removeOptimisticRequest(identifier)

        const response = await fetch(
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

        if (!response.ok) {
          throw new Error('Request failed')
        }

        setSelectedRequest(null)
      } finally {
        setProcessing((prev) => ({
          approving: new Set(
            [...prev.approving].filter((id) => id !== identifier)
          ),
          denying: new Set([...prev.denying].filter((id) => id !== identifier))
        }))
      }
    },
    [selectedRequest, removeOptimisticRequest]
  )

  const requestClicked = (request: AccessRequestData) => {
    setSelectedRequest(structuredClone(request))
    setTimeout(() => {
      selectedRequestRef.current?.scrollIntoView()
    }, 0)
  }

  const handleRequestChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setSelectedRequest((prev) =>
      prev ? { ...prev, [event.target.name]: value } : null
    )
  }

  return (
    <div className="animated fadeIn">
      {loginStatus.authenticationRequired === false && <EnableSecurity />}
      {loginStatus.authenticationRequired && (
        <div>
          <Card>
            <Card.Header>
              <FontAwesomeIcon icon={faAlignJustify} /> Access Requests
            </Card.Header>
            <Card.Body>
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
                  {(optimisticRequests || []).map((req) => {
                    return (
                      <tr
                        key={req.accessIdentifier}
                        onClick={() => requestClicked(req)}
                      >
                        <td>
                          {req.permissions === 'admin' ? (
                            <Badge bg="danger">Admin</Badge>
                          ) : req.permissions === 'readwrite' ? (
                            <Badge bg="warning">Read/Write</Badge>
                          ) : (
                            <Badge bg="secondary">Read Only</Badge>
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
            </Card.Body>
          </Card>

          {selectedRequest && (
            <div ref={selectedRequestRef}>
              <Card>
                <Card.Header>
                  <FontAwesomeIcon icon={faAlignJustify} /> Request
                </Card.Header>
                <Card.Body>
                  <Form.Group as={Row}>
                    <Col md="4" lg="2">
                      <Form.Label>Identifier</Form.Label>
                    </Col>
                    <Col xs="12" md="8">
                      <Form.Label>
                        {selectedRequest.accessIdentifier}
                      </Form.Label>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row}>
                    <Col md="4" lg="2">
                      <Form.Label>Description</Form.Label>
                    </Col>
                    <Col xs="12" md="8">
                      <Form.Label>
                        {selectedRequest.accessDescription}
                      </Form.Label>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row}>
                    <Col md="4" lg="2">
                      <Form.Label htmlFor="expiration">
                        Authentication Timeout
                      </Form.Label>
                    </Col>
                    <Col xs="12" md="8" lg="3">
                      <Form.Control
                        type="text"
                        id="expiration"
                        name="expiration"
                        autoComplete="off"
                        onChange={handleRequestChange}
                        value={selectedRequest.expiration || '1y'}
                      />
                      <Form.Text className="text-muted">
                        Examples: 60s, 1m, 1h, 1d, NEVER
                      </Form.Text>
                    </Col>
                  </Form.Group>
                  <Form.Group as={Row}>
                    <Col md="4" lg="2">
                      <Form.Label htmlFor="permissions">Permissions</Form.Label>
                    </Col>
                    <Col xs="12" md="8" lg="3">
                      {!selectedRequest.requestedPermissions && (
                        <Form.Select
                          id="permissions"
                          name="permissions"
                          value={selectedRequest.permissions || 'readonly'}
                          onChange={handleRequestChange}
                        >
                          <option value="readonly">Read Only</option>
                          <option value="readwrite">Read/Write</option>
                          <option value="admin">Admin</option>
                        </Form.Select>
                      )}
                      {selectedRequest.requestedPermissions && (
                        <Form.Label>
                          {selectedRequest.permissions === 'admin' ? (
                            <Badge bg="danger" style={{ fontSize: 'large' }}>
                              Admin
                            </Badge>
                          ) : selectedRequest.permissions === 'readwrite' ? (
                            <Badge bg="warning" style={{ fontSize: 'large' }}>
                              Read/Write
                            </Badge>
                          ) : (
                            <Badge bg="secondary" style={{ fontSize: 'large' }}>
                              Read Only
                            </Badge>
                          )}
                        </Form.Label>
                      )}
                    </Col>
                  </Form.Group>
                </Card.Body>
                <Card.Footer>
                  <Row
                    className={
                      'ms-0 me-0 d-flex justify-content-between justify-content-sm-start'
                    }
                  >
                    <Col xs="4" md="4" lg="2" className={'ps-0 pe-0 pe-md-2'}>
                      <Button
                        size="md"
                        variant="success"
                        onClick={() =>
                          handleAccessRequest(
                            selectedRequest.accessIdentifier,
                            true
                          )
                        }
                        disabled={
                          processing.approving.has(
                            selectedRequest.accessIdentifier
                          ) ||
                          processing.denying.has(
                            selectedRequest.accessIdentifier
                          )
                        }
                      >
                        <FontAwesomeIcon
                          icon={
                            processing.approving.has(
                              selectedRequest.accessIdentifier
                            )
                              ? faSpinner
                              : faCheck
                          }
                          spin={processing.approving.has(
                            selectedRequest.accessIdentifier
                          )}
                        />{' '}
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
                        variant="danger"
                        className="float-end float-sm-start"
                        onClick={() =>
                          handleAccessRequest(
                            selectedRequest.accessIdentifier,
                            false
                          )
                        }
                        disabled={
                          processing.approving.has(
                            selectedRequest.accessIdentifier
                          ) ||
                          processing.denying.has(
                            selectedRequest.accessIdentifier
                          )
                        }
                      >
                        <FontAwesomeIcon
                          icon={
                            processing.denying.has(
                              selectedRequest.accessIdentifier
                            )
                              ? faSpinner
                              : faBan
                          }
                          spin={processing.denying.has(
                            selectedRequest.accessIdentifier
                          )}
                        />{' '}
                        Deny
                      </Button>
                    </Col>
                  </Row>
                </Card.Footer>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
