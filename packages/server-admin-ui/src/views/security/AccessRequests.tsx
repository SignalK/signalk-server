import {
  useState,
  useRef,
  useOptimistic,
  useCallback,
  ChangeEvent
} from 'react'
import { useAppSelector } from '../../store'
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
  const accessRequests = useAppSelector(
    (state) => state.accessRequests
  ) as AccessRequestData[]
  const loginStatus = useAppSelector((state) => state.loginStatus)

  const [selectedRequest, setSelectedRequest] =
    useState<AccessRequestData | null>(null)
  const selectedRequestRef = useRef<HTMLDivElement>(null)

  const [processing, setProcessing] = useState<ProcessingState>({
    approving: new Set(),
    denying: new Set()
  })

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
            <CardHeader>
              <FontAwesomeIcon icon={faAlignJustify} /> Access Requests
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
                  {(optimisticRequests || []).map((req) => {
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
                  <FontAwesomeIcon icon={faAlignJustify} /> Request
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
                      <Label htmlFor="expiration">Authentication Timeout</Label>
                    </Col>
                    <Col xs="12" md="8" lg="3">
                      <Input
                        type="text"
                        id="expiration"
                        name="expiration"
                        autoComplete="off"
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
                      <Label htmlFor="permissions">Permissions</Label>
                    </Col>
                    <Col xs="12" md="8" lg="3">
                      {!selectedRequest.requestedPermissions && (
                        <Input
                          type="select"
                          id="permissions"
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
                        color="danger"
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
                </CardFooter>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
