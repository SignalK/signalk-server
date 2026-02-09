import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useActionState,
  ChangeEvent,
  KeyboardEvent
} from 'react'
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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import { faRightToBracket } from '@fortawesome/free-solid-svg-icons/faRightToBracket'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import { useLoginStatus } from '../../store'
import { loginAction as performLogin } from '../../actions'
import Dashboard from '../Dashboard/Dashboard'
import EnableSecurity from './EnableSecurity'

// HashRouter puts query params in the hash fragment
const getHashParams = (): URLSearchParams => {
  const hash = window.location.hash
  const queryIndex = hash.indexOf('?')
  if (queryIndex === -1) {
    return new URLSearchParams()
  }
  return new URLSearchParams(hash.substring(queryIndex + 1))
}

interface LoginState {
  error: string | null
}

export default function Login() {
  const loginStatus = useLoginStatus()

  const urlParams = getHashParams()
  const initialOidcError = urlParams.has('oidcError')
    ? urlParams.get('message') || 'SSO login failed'
    : null

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const [loginState, loginAction, isLoggingIn] = useActionState<
    LoginState,
    FormData
  >(
    async () => {
      const error = await performLogin(username, password, rememberMe)
      return { error }
    },
    { error: initialOidcError }
  )

  const prevLoginStatusRef = useRef(loginStatus.status)
  const isFirstRenderRef = useRef(true)

  const shouldSkipAutoLogin = useCallback((): boolean => {
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

  useEffect(() => {
    const shouldAutoLogin =
      loginStatus.status === 'notLoggedIn' &&
      loginStatus.oidcEnabled &&
      loginStatus.oidcAutoLogin &&
      !loginStatus.noUsers &&
      !shouldSkipAutoLogin()

    const statusChanged = prevLoginStatusRef.current !== loginStatus.status
    const shouldRedirect =
      shouldAutoLogin && (isFirstRenderRef.current || statusChanged)

    if (shouldRedirect) {
      window.location.href = loginStatus.oidcLoginUrl as string
    }

    prevLoginStatusRef.current = loginStatus.status
    isFirstRenderRef.current = false
  }, [loginStatus, shouldSkipAutoLogin])

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, type, checked, value } = event.target
    const inputValue = type === 'checkbox' ? checked : value
    if (name === 'username') setUsername(inputValue as string)
    else if (name === 'password') setPassword(inputValue as string)
    else if (name === 'rememberMe') setRememberMe(inputValue as boolean)
  }

  const handleInputKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const form = event.currentTarget.closest('form')
      if (form) {
        form.requestSubmit()
      }
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
                    <form action={loginAction}>
                      <h1>Login</h1>
                      <p className="text-muted">Sign In to your account</p>
                      <InputGroup className="mb-3">
                        <InputGroupText>
                          <FontAwesomeIcon icon={faUser} />
                        </InputGroupText>
                        <Input
                          type="text"
                          name="username"
                          placeholder="Username"
                          onChange={handleInputChange}
                          onKeyUp={handleInputKeyUp}
                          value={username}
                        />
                      </InputGroup>
                      <InputGroup className="mb-4">
                        <InputGroupText>
                          <FontAwesomeIcon icon={faLock} />
                        </InputGroupText>
                        <Input
                          type="password"
                          name="password"
                          placeholder="Password"
                          onChange={handleInputChange}
                          onKeyUp={handleInputKeyUp}
                          value={password}
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
                                checked={rememberMe}
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
                            type="submit"
                            color="primary"
                            className="px-4"
                            disabled={isLoggingIn}
                          >
                            <FontAwesomeIcon
                              icon={isLoggingIn ? faSpinner : faLock}
                              spin={isLoggingIn}
                            />{' '}
                            Login
                          </Button>
                        </Col>
                        <Col xs="6" className="text-end">
                          {loginState.error && (
                            <p className="text-danger">{loginState.error}</p>
                          )}
                          {!loginState.error &&
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
                    </form>
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
                                window.location.href =
                                  loginStatus.oidcLoginUrl as string
                              }}
                              color="secondary"
                              className="px-4"
                            >
                              <FontAwesomeIcon icon={faRightToBracket} />{' '}
                              {(loginStatus.oidcProviderName as string) ||
                                'SSO Login'}
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
