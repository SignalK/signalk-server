import React, { Component } from 'react'
import {
  Form,
  Container,
  Row,
  Col,
  CardGroup,
  Card,
  CardBody,
  Button,
  Input,
  InputGroup,
  InputGroupAddon,
  HelpBlock
} from 'reactstrap'
import { connect } from 'react-redux'
import { login, fetchAllData } from '../actions'
import Dashboard from './Dashboard/'

class Login extends Component {
  constructor (props) {
    super(props)
    this.state = {
      loggingIn: false,
      loginErrorMessage: null
    }
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick (event) {
    this.setState({ loggingIn: true })
    const { dispatch } = this.props
    login(dispatch, this.state.username, this.state.password, error => {
      this.setState({
        loggingIn: false,
        loginErrorMessage: error
      })
    })
  }

  handleInputChange (event) {
    this.setState({ [event.target.name]: event.target.value })
  }

  render () {
    return (
      <div>
        {this.props.loginStatus.status === 'notLoggedIn' && (
          <Container>
            <Row className='justify-content-center'>
              <Col md='8'>
                <CardGroup>
                  <Card className='p-4'>
                    <CardBody>
                      <h1>Login</h1>
                      <p className='text-muted'>Sign In to your account</p>
                      <InputGroup className='mb-3'>
                        <InputGroupAddon>
                          <i className='icon-user' />
                        </InputGroupAddon>
                        <Input
                          type='text'
                          name='username'
                          placeholder='Username'
                          onChange={this.handleInputChange}
                        />
                      </InputGroup>
                      <InputGroup className='mb-4'>
                        <InputGroupAddon>
                          <i className='icon-lock' />
                        </InputGroupAddon>
                        <Input
                          type='password'
                          name='password'
                          placeholder='Password'
                          onChange={this.handleInputChange}
                        />
                      </InputGroup>
                      <Row>
                        <Col xs='6'>
                          <Button
                            onClick={this.handleClick}
                            color='primary'
                            className='px-4'
                          >
                            <i
                              className={
                                this.state.loggingIn
                                  ? 'fa fa-spinner fa-spin'
                                  : 'fa fa-lock'
                              }
                            />{' '}
                            Login
                          </Button>
                        </Col>
                        <Col xs='6' className='text-right'>
                          <p className='text-danger'>
                            {this.state.loginErrorMessage}
                          </p>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </CardGroup>
              </Col>
            </Row>
          </Container>
        )}
        {this.props.loginStatus.status == 'loggedIn' && <Dashboard />}
      </div>
    )
  }
}

export default connect(({ loginStatus }) => ({ loginStatus }))(Login)
