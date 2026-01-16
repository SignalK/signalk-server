import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSelector } from 'react-redux'
import {
  Badge,
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
  Row
} from 'reactstrap'
import EnableSecurity from './EnableSecurity'

function convertType(type) {
  if (type === 'readonly') {
    return 'Read Only'
  } else if (type === 'readwrite') {
    return 'Read/Write'
  } else if (type === 'admin') {
    return 'Admin'
  }
}

const Users = () => {
  const loginStatus = useSelector((state) => state.loginStatus)
  const [users, setUsers] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const selectedUserRef = useRef(null)

  const fetchSecurityUsers = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/security/users`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        setUsers(data)
      })
  }, [])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      fetchSecurityUsers()
    }
  }, [loginStatus.authenticationRequired, fetchSecurityUsers])

  const handleUserChange = (event) => {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    setSelectedUser((prev) => ({
      ...prev,
      [event.target.name]: value
    }))
  }

  const handleAddUser = () => {
    const newUser = {
      type: 'readonly',
      isNew: true
    }
    setSelectedUser(newUser)
    setTimeout(() => {
      selectedUserRef.current?.scrollIntoView()
    }, 0)
  }

  const handleApply = (event) => {
    event.preventDefault()

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

    fetch(
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
      .then((response) => response.text())
      .then((response) => {
        setSelectedUser(null)
        alert(response)
        fetchSecurityUsers()
      })
  }

  const deleteUser = () => {
    fetch(
      `${window.serverRoutesPrefix}/security/users/${selectedUser.userId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      }
    )
      .then((response) => response.text())
      .then((response) => {
        setSelectedUser(null)
        alert(response)
        fetchSecurityUsers()
      })
  }

  const userClicked = (user) => {
    setSelectedUser(JSON.parse(JSON.stringify(user)))
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
            <CardHeader>
              <i className="fa fa-align-justify" />
              Users
            </CardHeader>
            <CardBody>
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
                            <Badge color="info" title="Authenticated via SSO">
                              SSO
                            </Badge>
                          ) : (
                            <Badge color="secondary">Local</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </CardBody>
            <CardFooter>
              <Button size="sm" color="primary" onClick={handleAddUser}>
                <i className="fa fa-plus-circle" /> Add
              </Button>
            </CardFooter>
          </Card>

          {selectedUser && (
            <div ref={selectedUserRef}>
              <Card>
                <CardHeader>
                  <i className="fa fa-align-justify" />
                  User
                  {selectedUser.isOIDC && (
                    <Badge color="info" className="ms-2">
                      SSO User
                    </Badge>
                  )}
                </CardHeader>
                <CardBody>
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="userid">User ID</Label>
                    </Col>
                    <Col xs="12" md="9">
                      {selectedUser.isNew && (
                        <Input
                          type="text"
                          name="userId"
                          value={selectedUser.userId || ''}
                          onChange={handleUserChange}
                        />
                      )}
                      {!selectedUser.isNew && (
                        <Label>{selectedUser.userId}</Label>
                      )}
                    </Col>
                  </FormGroup>
                  {selectedUser.email && (
                    <FormGroup row>
                      <Col md="2">
                        <Label>Email</Label>
                      </Col>
                      <Col xs="12" md="9">
                        <Label>{selectedUser.email}</Label>
                      </Col>
                    </FormGroup>
                  )}
                  {selectedUser.isOIDC ? (
                    <FormGroup row>
                      <Col md="12">
                        <FormText color="muted">
                          <i className="fa fa-info-circle" /> This user
                          authenticates via Single Sign-On. Password cannot be
                          set for SSO users.
                        </FormText>
                      </Col>
                    </FormGroup>
                  ) : (
                    <>
                      <FormGroup row>
                        <Col md="2">
                          <Label htmlFor="password">Password</Label>
                        </Col>
                        <Col xs="12" md="9">
                          <Input
                            type="password"
                            name="password"
                            value={selectedUser.password || ''}
                            onChange={handleUserChange}
                          />
                        </Col>
                      </FormGroup>
                      <FormGroup row>
                        <Col md="2">
                          <Label htmlFor="text-input">Confirm Password</Label>
                        </Col>
                        <Col xs="12" md="9">
                          <Input
                            type="password"
                            name="confirmPassword"
                            value={selectedUser.confirmPassword || ''}
                            onChange={handleUserChange}
                          />
                        </Col>
                      </FormGroup>
                    </>
                  )}
                  <FormGroup row>
                    <Col md="2">
                      <Label htmlFor="select">Permissions</Label>
                    </Col>
                    <Col xs="12" md="2">
                      <Input
                        type="select"
                        name="type"
                        value={selectedUser.type || 'readonly'}
                        onChange={handleUserChange}
                      >
                        <option value="readonly">Read Only</option>
                        <option value="readwrite">Read/Write</option>
                        <option value="admin">Admin</option>
                      </Input>
                    </Col>
                  </FormGroup>
                </CardBody>
                <CardFooter>
                  <Row>
                    <Col xs="4" md="1">
                      <Button size="sm" color="primary" onClick={handleApply}>
                        <i className="fa fa-dot-circle-o" /> Apply
                      </Button>
                    </Col>
                    <Col xs="4" md="1">
                      <Button
                        size="sm"
                        color="secondary"
                        onClick={handleCancel}
                      >
                        <i className="fa fa-ban" /> Cancel
                      </Button>
                    </Col>
                    <Col xs="4" md="10" className="text-end">
                      <Button size="sm" color="danger" onClick={deleteUser}>
                        <i className="fa fa-ban" /> Delete
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

export default Users
