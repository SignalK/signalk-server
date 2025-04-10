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
  Table,
  Row,
} from 'reactstrap'
import EnableSecurity from './EnableSecurity.js'

export function fetchSecurityUsers() {
  fetch(`${window.serverRoutesPrefix}/security/users`, {
    credentials: 'include',
  })
    .then((response) => response.json())
    .then((data) => {
      this.setState({ users: data })
    })
}

class Users extends Component {
  constructor(props) {
    super(props)
    this.state = {}

    this.handleAddUser = this.handleAddUser.bind(this)
    this.fetchSecurityUsers = fetchSecurityUsers.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleApply = this.handleApply.bind(this)
    this.handleUserChange = this.handleUserChange.bind(this)
    this.deleteUser = this.deleteUser.bind(this)
  }

  componentDidMount() {
    if (this.props.loginStatus.authenticationRequired) {
      this.fetchSecurityUsers()
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.loginStatus.authenticationRequired !=
      prevProps.loginStatus.authenticationRequired
    ) {
      this.fetchSecurityUsers()
    }
  }

  handleUserChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.selectedUser[event.target.name] = value
    this.setState({
      selectedUser: this.state.selectedUser,
    })
  }

  handleAddUser() {
    var newUser = {
      type: 'readonly',
      isNew: true,
    }
    this.setState(
      {
        selectedUser: newUser,
        selectedIndex: this.state.users.length - 1,
      },
      () => {
        this.refs['selectedUser'].scrollIntoView()
      }
    )
  }

  handleApply(event) {
    event.preventDefault()

    if (
      !this.state.selectedUser.userId ||
      this.state.selectedUser.userId.length == 0
    ) {
      alert('Please specify a User Id')
      return
    }

    if (this.state.selectedUser.password) {
      if (
        this.state.selectedUser.password !=
        this.state.selectedUser.confirmPassword
      ) {
        alert('Passwords do not match')
        return
      }
    }

    var isNew = this.state.selectedUser.isNew

    var payload = {
      password: this.state.selectedUser.password,
      type: this.state.selectedUser.type || 'readonly',
    }

    fetch(
      `${window.serverRoutesPrefix}/security/users/${this.state.selectedUser.userId}`,
      {
        method: isNew ? 'POST' : 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      }
    )
      .then((response) => response.text())
      .then((response) => {
        this.setState({
          selectedUser: null,
          selectedIndex: -1,
        })
        alert(response)
        this.fetchSecurityUsers()
      })
  }

  deleteUser() {
    fetch(
      `${window.serverRoutesPrefix}/security/users/${this.state.selectedUser.userId}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      }
    )
      .then((response) => response.text())
      .then((response) => {
        this.setState({
          selectedUser: null,
          selectedIndex: -1,
        })
        alert(response)
        this.fetchSecurityUsers()
      })
  }

  userClicked(user, index) {
    this.setState(
      {
        selectedUser: JSON.parse(JSON.stringify(user)),
        selectedIndex: index,
      },
      () => {
        this.refs['selectedUser'].scrollIntoView()
      }
    )
  }

  handleCancel() {
    this.setState({ selectedUser: null })
  }
  render() {
    return (
      <div className="animated fadeIn">
        {this.props.loginStatus.authenticationRequired === false && (
          <EnableSecurity />
        )}
        {this.state.users && this.props.loginStatus.authenticationRequired && (
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
                    </tr>
                  </thead>
                  <tbody>
                    {(this.state.users || []).map((user, index) => {
                      return (
                        <tr
                          key={user.userId}
                          onClick={this.userClicked.bind(this, user, index)}
                        >
                          <td>{user.userId}</td>
                          <td>{convertType(user.type)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </CardBody>
              <CardFooter>
                <Button size="sm" color="primary" onClick={this.handleAddUser}>
                  <i className="fa fa-plus-circle" /> Add
                </Button>
              </CardFooter>
            </Card>

            {this.state.selectedUser && (
              <div ref="selectedUser">
                <Card>
                  <CardHeader>
                    <i className="fa fa-align-justify" />
                    User
                  </CardHeader>
                  <CardBody>
                    <FormGroup row>
                      <Col md="2">
                        <Label htmlFor="userid">User ID</Label>
                      </Col>
                      <Col xs="12" md="9">
                        {this.state.selectedUser.isNew && (
                          <Input
                            type="text"
                            name="userId"
                            value={this.state.selectedUser.userId}
                            onChange={this.handleUserChange}
                          />
                        )}
                        {!this.state.selectedUser.isNew && (
                          <Label>{this.state.selectedUser.userId}</Label>
                        )}
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="2">
                        <Label htmlFor="password">Password</Label>
                      </Col>
                      <Col xs="12" md="9">
                        <Input
                          type="password"
                          name="password"
                          value={this.state.selectedUser.password}
                          onChange={this.handleUserChange}
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
                          value={this.state.selectedUser.confirmPassword}
                          onChange={this.handleUserChange}
                        />
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md="2">
                        <Label htmlFor="select">Permissions</Label>
                      </Col>
                      <Col xs="12" md="2">
                        <Input
                          type="select"
                          name="type"
                          value={this.state.selectedUser.type}
                          onChange={this.handleUserChange}
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
                        <Button
                          size="sm"
                          color="primary"
                          onClick={this.handleApply}
                        >
                          <i className="fa fa-dot-circle-o" /> Apply
                        </Button>
                      </Col>
                      <Col xs="4" md="1">
                        <Button
                          size="sm"
                          color="secondary"
                          onClick={this.handleCancel}
                        >
                          <i className="fa fa-ban" /> Cancel
                        </Button>
                      </Col>
                      <Col xs="4" md="10" className="text-right">
                        <Button
                          size="sm"
                          color="danger"
                          onClick={this.deleteUser}
                        >
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
}

const mapStateToProps = ({ loginStatus }) => ({ loginStatus })

export default connect(mapStateToProps)(Users)

function convertType(type) {
  if (type == 'readonly') {
    return 'Read Only'
  } else if (type == 'readwrite') {
    return 'Read/Write'
  } else if (type == 'admin') {
    return 'Admin'
  }
}
