import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  InputGroup,
  InputGroupAddon,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
  Table,
  Row
} from 'reactstrap'
import EnableSecurity from './EnableSecurity'

export function fetchSecurityConfig () {
  fetch(`/security/config`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      this.setState(data)
    })
}

export function fetchSecurityUsers () {
  fetch(`/security/users`, {
    credentials: 'include'
  })
    .then(response => response.json())
    .then(data => {
      this.setState({ users: data })
    })
}

class Security extends Component {
  constructor (props) {
    super(props)
    this.state = {
      users: [],
      allow_readonly: false,
      expiration: ''
    }

    this.handleChange = this.handleChange.bind(this)
    this.handleAddUser = this.handleAddUser.bind(this)
    this.handleSaveConfig = this.handleSaveConfig.bind(this)
    this.fetchSecurityUsers = fetchSecurityUsers.bind(this)
    this.fetchSecurityConfig = fetchSecurityConfig.bind(this)
    this.handleCancel = this.handleCancel.bind(this)
    this.handleApply = this.handleApply.bind(this)
    this.handleUserChange = this.handleUserChange.bind(this)
    this.deleteUser = this.deleteUser.bind(this)
  }

  componentDidMount () {
    if (this.props.loginStatus.authenticationRequired) {
      this.fetchSecurityConfig()
      this.fetchSecurityUsers()
    }
  }

  handleChange (event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleUserChange (event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.state.selectedUser[event.target.name] = value
    this.setState({
      selectedUser: this.state.selectedUser
    })
  }

  handleAddUser (event) {
    var newUser = {
      type: 'readonly',
      isNew: true
    }
    this.setState(
      {
        selectedUser: newUser,
        selectedIndex: this.state.users.length - 1
      },
      () => {
        this.refs['selectedUser'].scrollIntoView()
      }
    )
  }

  handleApply (event) {
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
      type: this.state.selectedUser.type || 'readonly'
    }

    fetch(`/security/users/${this.state.selectedUser.userId}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        this.setState({
          selectedUser: null,
          selectedIndex: -1
        })
        alert(response)
        this.fetchSecurityUsers()
      })
  }

  deleteUser (event) {
    fetch(`/security/users/${this.state.selectedUser.userId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        this.setState({
          selectedUser: null,
          selectedIndex: -1
        })
        alert(response)
        this.fetchSecurityUsers()
      })
  }

  handleSaveConfig () {
    var payload = {
      allow_readonly: this.state.allow_readonly,
      expiration: this.state.expiration
    }
    fetch('/security/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'include'
    })
      .then(response => response.text())
      .then(response => {
        this.fetchSecurityConfig()
        alert(response)
      })
  }

  userClicked (user, index) {
    console.log(JSON.stringify(user))
    this.setState(
      {
        selectedUser: JSON.parse(JSON.stringify(user)),
        selectedIndex: index
      },
      () => {
        this.refs['selectedUser'].scrollIntoView()
      }
    )
  }

  handleCancel (event) {
    this.setState({ selectedUser: null })
  }
  render () {
    return (
      <div className='animated fadeIn'>
        {this.props.loginStatus.authenticationRequired === false && (
          <EnableSecurity />
        )}
        {this.props.loginStatus.authenticationRequired && (
          <div>
            <Card>
              <CardHeader>
                <i className='fa fa-align-justify' />Settings
              </CardHeader>
              <CardBody>
                <Form
                  action=''
                  method='post'
                  encType='multipart/form-data'
                  className='form-horizontal'
                >
                  <FormGroup row>
                    <Col xs='0' md='2'>
                      <Label>Allow Readonly Access</Label>
                    </Col>
                    <Col md='9'>
                      <FormGroup check>
                        <div>
                          <Label className='switch switch-text switch-primary'>
                            <Input
                              type='checkbox'
                              name='allow_readonly'
                              className='switch-input'
                              onChange={this.handleChange}
                              checked={this.state.allow_readonly}
                            />
                            <span
                              className='switch-label'
                              data-on='Yes'
                              data-off='No'
                            />
                            <span className='switch-handle' />
                          </Label>
                        </div>
                      </FormGroup>
                    </Col>
                  </FormGroup>
                  <FormGroup row>
                    <Col md='2'>
                      <Label htmlFor='text-input'>Login Session Timeout</Label>
                    </Col>
                    <Col xs='12' md='9'>
                      <Input
                        type='text'
                        name='expiration'
                        onChange={this.handleChange}
                        value={this.state.expiration}
                      />
                      <FormText color='muted'>
                        Exmaples: 60s, 1m, 1h, 1d
                      </FormText>
                    </Col>
                  </FormGroup>
                </Form>
              </CardBody>
              <CardFooter>
                <Button
                  size='sm'
                  color='primary'
                  onClick={this.handleSaveConfig}
                >
                  <i className='fa fa-dot-circle-o' /> Save
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <i className='fa fa-align-justify' />Users
              </CardHeader>
              <CardBody>
                <Table hover responsive bordered striped size='sm'>
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
                          onClick={this.userClicked.bind(
                            this,
                            user,
                            index
                          )}
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
                <Button size='sm' color='primary' onClick={this.handleAddUser}>
                  <i className='fa fa-plus-circle' /> Add
                </Button>
              </CardFooter>
            </Card>

            {this.state.selectedUser && (
              <div ref='selectedUser'>
                <Card>
                  <CardHeader>
                    <i className='fa fa-align-justify' />User
                  </CardHeader>
                  <CardBody>
                    <FormGroup row>
                      <Col md='2'>
                        <Label htmlFor='userid'>User ID</Label>
                      </Col>
                      <Col xs='12' md='9'>
                        {this.state.selectedUser.isNew && (
                          <Input
                            type='text'
                            name='userId'
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
                      <Col md='2'>
                        <Label htmlFor='password'>Password</Label>
                      </Col>
                      <Col xs='12' md='9'>
                        <Input
                          type='password'
                          name='password'
                          value={this.state.selectedUser.password}
                          onChange={this.handleUserChange}
                        />
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md='2'>
                        <Label htmlFor='text-input'>Confirm Password</Label>
                      </Col>
                      <Col xs='12' md='9'>
                        <Input
                          type='password'
                          name='confirmPassword'
                          value={this.state.selectedUser.confirmPassword}
                          onChange={this.handleUserChange}
                        />
                      </Col>
                    </FormGroup>
                    <FormGroup row>
                      <Col md='2'>
                        <Label htmlFor='select'>Permissions</Label>
                      </Col>
                      <Col xs='12' md='2'>
                        <Input
                          type='select'
                          name='type'
                          value={this.state.selectedUser.type}
                          onChange={this.handleUserChange}
                        >
                          <option value='readonly'>Read Only</option>
                          <option value='readwrite'>Read/Write</option>
                          <option value='admin'>Admin</option>
                        </Input>
                      </Col>
                    </FormGroup>
                  </CardBody>
                  <CardFooter>
                    <Row>
                      <Col xs='4' md='1'>
                        <Button
                          size='sm'
                          color='primary'
                          onClick={this.handleApply}
                        >
                          <i className='fa fa-dot-circle-o' /> Apply
                        </Button>
                      </Col>
                      <Col xs='4' md='1'>
                        <Button
                          size='sm'
                          color='secondary'
                          onClick={this.handleCancel}
                        >
                          <i className='fa fa-ban' /> Cancel
                        </Button>
                      </Col>
                      <Col xs='4' md='10' className='text-right'>
                        <Button
                          size='sm'
                          color='danger'
                          onClick={this.deleteUser}
                        >
                          <i className='fa fa-ban' /> Delete
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

const mapStateToProps = ({ securityConfig, securityUsers }) => ({
  securityConfig,
  securityUsers
})

export default connect(mapStateToProps)(Security)

function convertType (type) {
  if (type == 'readonly') {
    return 'Read Only'
  } else if (type == 'readwrite') {
    return 'Read/Write'
  } else if (type == 'admin') {
    return 'Admin'
  }
}
