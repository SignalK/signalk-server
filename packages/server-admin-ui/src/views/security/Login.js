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
  HelpBlock,
  Label
} from 'reactstrap'
import { Link } from 'react-router-dom'
import { connect } from 'react-redux'
import { login, fetchAllData } from '../../actions'
import Dashboard from '../Dashboard/Dashboard'
import EnableSecurity from './EnableSecurity'

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
    login(dispatch, this.state.username, this.state.password, this.state.rememberMe, error => {
      this.setState({
        loggingIn: false,
        loginErrorMessage: error
      })
    })
  }

  handleInputChange (event) {
    var value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  render () {
    if (this.props.loginStatus.status === 'notLoggedIn' &&
        this.props.loginStatus.noUsers === true ) {
      return (
          <EnableSecurity />
      )
    } else {
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
                          <Col xs='8'>
                            <InputGroup className='mb-4'>
                            <Label className='switch switch-text switch-primary'>
                            <Input
                              type='checkbox'
                              name='rememberMe'
                              className='switch-input'
                              onChange={this.handleInputChange}
                            />
                           <span className='switch-label' data-on='Yes' data-off='No' />
                           <span className='switch-handle' />
                           </Label>&nbsp; Remember Me
                           </InputGroup>
                         </Col>
                      </Row>
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
            {!this.state.loginErrorMessage && this.props.loginStatus.allowNewUserRegistration &&
          <div>
          <Link to="/register">
          <Button color="link" className="px-0">Sign up</Button>
         </Link>
          </div>
         }
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
}

export default connect(({ loginStatus }) => ({ loginStatus }))(Login)
