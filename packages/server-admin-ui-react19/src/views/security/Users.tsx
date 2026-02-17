import {
  useState,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  FormEvent
} from 'react'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import Table from 'react-bootstrap/Table'
import { useLoginStatus } from '../../store'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAlignJustify } from '@fortawesome/free-solid-svg-icons/faAlignJustify'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons/faCircleInfo'
import { faCirclePlus } from '@fortawesome/free-solid-svg-icons/faCirclePlus'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import EnableSecurity from './EnableSecurity'

type UserType = 'readonly' | 'readwrite' | 'admin'

interface User {
  userId: string
  type?: UserType
  email?: string
  isOIDC?: boolean
  isNew?: boolean
  password?: string
  confirmPassword?: string
}

function convertType(type: UserType | undefined): string {
  if (type === 'readonly') {
    return 'Read Only'
  } else if (type === 'readwrite') {
    return 'Read/Write'
  } else if (type === 'admin') {
    return 'Admin'
  }
  return ''
}

export default function Users() {
  const loginStatus = useLoginStatus()
  const [users, setUsers] = useState<User[] | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const selectedUserRef = useRef<HTMLDivElement>(null)

  const loadUsers = useCallback(async (): Promise<User[]> => {
    const response = await fetch(
      `${window.serverRoutesPrefix}/security/users`,
      {
        credentials: 'include'
      }
    )
    return response.json()
  }, [])

  const refreshUsers = useCallback(() => {
    loadUsers().then((data) => {
      setUsers(data)
    })
  }, [loadUsers])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      loadUsers().then((data) => {
        setUsers(data)
      })
    }
  }, [loginStatus.authenticationRequired, loadUsers])

  const handleUserChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setSelectedUser((prev) =>
      prev ? { ...prev, [event.target.name]: value } : null
    )
  }

  const handleAddUser = () => {
    const newUser: User = {
      userId: '',
      type: 'readonly',
      isNew: true
    }
    setSelectedUser(newUser)
    setTimeout(() => {
      selectedUserRef.current?.scrollIntoView()
    }, 0)
  }

  const handleApply = async (event: FormEvent) => {
    event.preventDefault()

    if (!selectedUser) return

    if (!selectedUser.userId || selectedUser.userId.length === 0) {
      alert('Please specify a User Id')
      return
    }

    if (selectedUser.password) {
      if (selectedUser.password !== selectedUser.confirmPassword) {
        alert('Passwords do not match')
        return
      }
    }

    const isNew = selectedUser.isNew

    const payload = {
      password: selectedUser.password,
      type: selectedUser.type || 'readonly'
    }

    const response = await fetch(
      `${window.serverRoutesPrefix}/security/users/${selectedUser.userId}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        credentials: 'include'
      }
    )
    const text = await response.text()
    setSelectedUser(null)
    alert(text)
    refreshUsers()
  }

  const deleteUser = async () => {
    if (!selectedUser) return

    const response = await fetch(
      `${window.serverRoutesPrefix}/security/users/${selectedUser.userId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    )
    const text = await response.text()
    setSelectedUser(null)
    alert(text)
    refreshUsers()
  }

  const userClicked = (user: User) => {
    setSelectedUser(structuredClone(user))
    setTimeout(() => {
      selectedUserRef.current?.scrollIntoView()
    }, 0)
  }

  const handleCancel = () => {
    setSelectedUser(null)
  }

  return (
    <div className="animated fadeIn">
      {loginStatus.authenticationRequired === false && <EnableSecurity />}
      {users && loginStatus.authenticationRequired && (
        <div>
          <Card>
            <Card.Header>
              <FontAwesomeIcon icon={faAlignJustify} /> Users
            </Card.Header>
            <Card.Body>
              <Table hover responsive bordered striped size="sm">
                <thead>
                  <tr>
                    <th>User ID</th>
                    <th>Type</th>
                    <th>Auth</th>
                  </tr>
                </thead>
                <tbody>
                  {(users || []).map((user) => {
                    return (
                      <tr key={user.userId} onClick={() => userClicked(user)}>
                        <td>
                          {user.userId}
                          {user.email && (
                            <small className="text-muted ms-2">
                              ({user.email})
                            </small>
                          )}
                        </td>
                        <td>{convertType(user.type)}</td>
                        <td>
                          {user.isOIDC ? (
                            <Badge bg="info" title="Authenticated via SSO">
                              SSO
                            </Badge>
                          ) : (
                            <Badge bg="secondary">Local</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </Card.Body>
            <Card.Footer>
              <Button size="sm" variant="primary" onClick={handleAddUser}>
                <FontAwesomeIcon icon={faCirclePlus} /> Add
              </Button>
            </Card.Footer>
          </Card>

          {selectedUser && (
            <div ref={selectedUserRef}>
              <Card>
                <Card.Header>
                  <FontAwesomeIcon icon={faAlignJustify} /> User
                  {selectedUser.isOIDC && (
                    <Badge bg="info" className="ms-2">
                      SSO User
                    </Badge>
                  )}
                </Card.Header>
                <Card.Body>
                  <Form.Group as={Row}>
                    <Col md="2">
                      <Form.Label htmlFor="userId">User ID</Form.Label>
                    </Col>
                    <Col xs="12" md="9">
                      {selectedUser.isNew && (
                        <Form.Control
                          type="text"
                          id="userId"
                          name="userId"
                          autoComplete="off"
                          value={selectedUser.userId || ''}
                          onChange={handleUserChange}
                        />
                      )}
                      {!selectedUser.isNew && (
                        <Form.Label>{selectedUser.userId}</Form.Label>
                      )}
                    </Col>
                  </Form.Group>
                  {selectedUser.email && (
                    <Form.Group as={Row}>
                      <Col md="2">
                        <Form.Label>Email</Form.Label>
                      </Col>
                      <Col xs="12" md="9">
                        <Form.Label>{selectedUser.email}</Form.Label>
                      </Col>
                    </Form.Group>
                  )}
                  {selectedUser.isOIDC ? (
                    <Form.Group as={Row}>
                      <Col md="12">
                        <Form.Text muted>
                          <FontAwesomeIcon icon={faCircleInfo} /> This user
                          authenticates via Single Sign-On. Password cannot be
                          set for SSO users.
                        </Form.Text>
                      </Col>
                    </Form.Group>
                  ) : (
                    <>
                      <Form.Group as={Row}>
                        <Col md="2">
                          <Form.Label htmlFor="password">Password</Form.Label>
                        </Col>
                        <Col xs="12" md="9">
                          <Form.Control
                            type="password"
                            id="password"
                            name="password"
                            autoComplete="new-password"
                            value={selectedUser.password || ''}
                            onChange={handleUserChange}
                          />
                        </Col>
                      </Form.Group>
                      <Form.Group as={Row}>
                        <Col md="2">
                          <Form.Label htmlFor="confirmPassword">
                            Confirm Password
                          </Form.Label>
                        </Col>
                        <Col xs="12" md="9">
                          <Form.Control
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            autoComplete="new-password"
                            value={selectedUser.confirmPassword || ''}
                            onChange={handleUserChange}
                          />
                        </Col>
                      </Form.Group>
                    </>
                  )}
                  <Form.Group as={Row}>
                    <Col md="2">
                      <Form.Label htmlFor="permissions">Permissions</Form.Label>
                    </Col>
                    <Col xs="12" md="2">
                      <Form.Select
                        id="permissions"
                        name="type"
                        value={selectedUser.type || 'readonly'}
                        onChange={handleUserChange}
                      >
                        <option value="readonly">Read Only</option>
                        <option value="readwrite">Read/Write</option>
                        <option value="admin">Admin</option>
                      </Form.Select>
                    </Col>
                  </Form.Group>
                </Card.Body>
                <Card.Footer>
                  <div className="d-flex flex-wrap gap-2">
                    <Button size="sm" variant="primary" onClick={handleApply}>
                      <FontAwesomeIcon icon={faFloppyDisk} /> Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCancel}
                    >
                      <FontAwesomeIcon icon={faBan} /> Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      className="ms-auto"
                      onClick={deleteUser}
                    >
                      <FontAwesomeIcon icon={faBan} /> Delete
                    </Button>
                  </div>
                </Card.Footer>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
