import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Container,
  Row,
  Col,
  CardGroup,
  Card,
  CardBody,
  Button,
  Input,
  InputGroup,
  InputGroupText,
  Label
} from 'reactstrap'
import { Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { login } from '../../actions'
import Dashboard from '../Dashboard/Dashboard'
import EnableSecurity from './EnableSecurity'

// Parse URL parameters from hash fragment (for HashRouter)
// e.g., "#/login?oidcError=true" → URLSearchParams with oidcError=true
const getHashParams = () => {
  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) {
    return new URLSearchParams()
  }
  return new URLSearchParams(hash.substring(queryIndex + 1))
}

const Login = () => {
  const dispatch = useDispatch()
  const loginStatus = useSelector((state) => state.loginStatus)

  // Get initial OIDC error from URL
  const urlParams = getHashParams()
  const initialOidcError = urlParams.has('oidcError')
    ? urlParams.get('message') || 'SSO login failed'
    : null

  const [loggingIn, setLoggingIn] = useState(false)
  const [loginErrorMessage, setLoginErrorMessage] = useState(initialOidcError)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const prevLoginStatusRef = useRef(loginStatus.status)

  const shouldSkipAutoLogin = useCallback(() => {
    // Check URL params to prevent redirect loops and provide escape hatch
    const params = getHashParams()
    // Skip if OIDC callback returned an error
    if (params.has('oidcError')) {
      return true
    }
    // Skip if user explicitly requested no auto-login (escape hatch)
    if (params.get('noAutoLogin') === 'true') {
      return true
    }
    return false
  }, [])

  const tryAutoLogin = useCallback(() => {
    if (
      loginStatus.status === 'notLoggedIn' &&
      loginStatus.oidcEnabled &&
      loginStatus.oidcAutoLogin &&
      !loginStatus.noUsers &&
      !shouldSkipAutoLogin()
    ) {
      window.location.href = loginStatus.oidcLoginUrl
    }
  }, [loginStatus, shouldSkipAutoLogin])

  // componentDidMount equivalent
  useEffect(() => {
    tryAutoLogin()
  }, [])

  // componentDidUpdate equivalent for OIDC auto-login
  useEffect(() => {
    if (
      loginStatus.status === 'notLoggedIn' &&
      loginStatus.oidcEnabled &&
      loginStatus.oidcAutoLogin &&
      !loginStatus.noUsers &&
      prevLoginStatusRef.current !== loginStatus.status &&
      !shouldSkipAutoLogin()
    ) {
      window.location.href = loginStatus.oidcLoginUrl
    }
    prevLoginStatusRef.current = loginStatus.status
  }, [loginStatus, shouldSkipAutoLogin])

  const handleClick = () => {
    setLoggingIn(true)
    login(dispatch, username, password, rememberMe, (error) => {
      setLoggingIn(false)
      setLoginErrorMessage(error)
    })
  }

  const handleInputChange = (event) => {
    const { name, type, checked, value } = event.target
    const inputValue = type === 'checkbox' ? checked : value
    if (name === 'username') setUsername(inputValue)
    else if (name === 'password') setPassword(inputValue)
    else if (name === 'rememberMe') setRememberMe(inputValue)
  }

  const handleInputKeyUp = (event) => {
    if (event.key === 'Enter') {
      handleClick()
    }
  }

  if (loginStatus.status === 'notLoggedIn' && loginStatus.noUsers === true) {
    return <EnableSecurity />
  }

  return (
    <div>
      {loginStatus.status === 'notLoggedIn' && (
        <Container>
          <Row className="justify-content-center">
            <Col md="8">
              <CardGroup>
                <Card className="p-4">
                  <CardBody>
                    <h1>Login</h1>
                    <p className="text-muted">Sign In to your account</p>
                    <InputGroup className="mb-3">
                      <InputGroupText>
                        <i className="icon-user" />
                      </InputGroupText>
                      <Input
                        type="text"
                        name="username"
                        placeholder="Username"
                        onChange={handleInputChange}
                        onKeyUp={handleInputKeyUp}
                      />
                    </InputGroup>
                    <InputGroup className="mb-4">
                      <InputGroupText>
                        <i className="icon-lock" />
                      </InputGroupText>
                      <Input
                        type="password"
                        name="password"
                        placeholder="Password"
                        onChange={handleInputChange}
                        onKeyUp={handleInputKeyUp}
                      />
                    </InputGroup>
                    <Row>
                      <Col xs="8">
                        <InputGroup className="mb-4">
                          <Label className="switch switch-text switch-primary">
                            <Input
                              type="checkbox"
                              name="rememberMe"
                              className="switch-input"
                              onChange={handleInputChange}
                            />
                            <span
                              className="switch-label"
                              data-on="Yes"
                              data-off="No"
                            />
                            <span className="switch-handle" />
                          </Label>
                          &nbsp; Remember Me
                        </InputGroup>
                      </Col>
                    </Row>
                    <Row>
                      <Col xs="6">
                        <Button
                          onClick={handleClick}
                          color="primary"
                          className="px-4"
                        >
                          <i
                            className={
                              loggingIn ? 'fa fa-spinner fa-spin' : 'fa fa-lock'
                            }
                          />{' '}
                          Login
                        </Button>
                      </Col>
                      <Col xs="6" className="text-end">
                        {loginErrorMessage && (
                          <p className="text-danger">{loginErrorMessage}</p>
                        )}
                        {!loginErrorMessage &&
                          loginStatus.allowNewUserRegistration && (
                            <div>
                              <Link to="/register">
                                <Button color="link" className="px-0">
                                  Sign up
                                </Button>
                              </Link>
                            </div>
                          )}
                      </Col>
                    </Row>
                    {loginStatus.oidcEnabled && (
                      <>
                        <Row className="mt-4 mb-3">
                          <Col className="text-center">
                            <span className="text-muted">
                              &#8212; or &#8212;
                            </span>
                          </Col>
                        </Row>
                        <Row>
                          <Col className="text-center">
                            <Button
                              onClick={() => {
                                window.location.href = loginStatus.oidcLoginUrl
                              }}
                              color="secondary"
                              className="px-4"
                            >
                              <i className="fa fa-sign-in" />{' '}
                              {loginStatus.oidcProviderName || 'SSO Login'}
                            </Button>
                          </Col>
                        </Row>
                      </>
                    )}
                  </CardBody>
                </Card>
              </CardGroup>
            </Col>
          </Row>
        </Container>
      )}
      {loginStatus.status === 'loggedIn' && <Dashboard />}
    </div>
  )
}

export default Login
