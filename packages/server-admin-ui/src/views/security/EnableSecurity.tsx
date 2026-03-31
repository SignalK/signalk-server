import {
  useState,
  useEffect,
  useActionState,
  ChangeEvent,
  KeyboardEvent
} from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import CardGroup from 'react-bootstrap/CardGroup'
import Col from 'react-bootstrap/Col'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import InputGroup from 'react-bootstrap/InputGroup'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'
import { faRotateLeft } from '@fortawesome/free-solid-svg-icons/faRotateLeft'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import { useLoginStatus } from '../../store'
import {
  enableSecurity,
  checkSecurityBackup,
  restoreSecurity
} from '../../actions'
import Login from './Login'

interface EnableSecurityState {
  error: string | null
}

export default function EnableSecurity() {
  const loginStatus = useLoginStatus()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [allowReadonly, setAllowReadonly] = useState(false)
  const [hasBackup, setHasBackup] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoreUsername, setRestoreUsername] = useState('')
  const [restorePassword, setRestorePassword] = useState('')

  useEffect(() => {
    checkSecurityBackup()
      .then(setHasBackup)
      .catch((err) => console.error('Failed to check security backup:', err))
  }, [])

  const handleRestore = async () => {
    if (isRestoring || !restoreUsername || !restorePassword) {
      return
    }
    setIsRestoring(true)
    setRestoreError(null)
    const error = await restoreSecurity(restoreUsername, restorePassword)
    setIsRestoring(false)
    if (error) {
      setRestoreError(error)
    } else {
      alert(
        'Security restored. Please restart the server for changes to take effect.'
      )
    }
  }

  const [state, submitAction, isEnabling] = useActionState<
    EnableSecurityState,
    FormData
  >(
    async () => {
      const error = await enableSecurity(username, password, allowReadonly)
      return { error }
    },
    { error: null }
  )

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target
    if (name === 'username') setUsername(value)
    else if (name === 'password') setPassword(value)
  }

  const handleInputKeyUp = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const form = event.currentTarget.form
      if (form) {
        form.requestSubmit()
      }
    }
  }

  return (
    <div>
      {loginStatus.authenticationRequired && !loginStatus.noUsers && <Login />}
      {(loginStatus.authenticationRequired === false ||
        loginStatus.noUsers === true) && (
        <Container>
          <Row className="justify-content-center">
            <Col md="8">
              <CardGroup>
                <Card className="p-4">
                  <Card.Body>
                    {loginStatus.securityWasEnabled &&
                      loginStatus.authenticationRequired === false && (
                        <p className="text-danger">
                          Security has been enabled, please restart the server
                        </p>
                      )}
                    {!loginStatus.securityWasEnabled && hasBackup && (
                      <div className="mb-4">
                        <h1>Enable Security</h1>
                        <Alert variant="info">
                          <p className="mb-2">
                            A previous security configuration was found. Enter
                            admin credentials from the previous configuration to
                            restore it.
                          </p>
                          <InputGroup className="mb-2">
                            <InputGroup.Text>
                              <FontAwesomeIcon icon={faUser} />
                            </InputGroup.Text>
                            <Form.Control
                              type="text"
                              placeholder="Admin username"
                              aria-label="Admin username"
                              value={restoreUsername}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setRestoreUsername(e.target.value)
                              }
                              onKeyUp={(e: KeyboardEvent<HTMLInputElement>) =>
                                e.key === 'Enter' && handleRestore()
                              }
                            />
                          </InputGroup>
                          <InputGroup className="mb-2">
                            <InputGroup.Text>
                              <FontAwesomeIcon icon={faLock} />
                            </InputGroup.Text>
                            <Form.Control
                              type="password"
                              placeholder="Password"
                              aria-label="Password"
                              value={restorePassword}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setRestorePassword(e.target.value)
                              }
                              onKeyUp={(e: KeyboardEvent<HTMLInputElement>) =>
                                e.key === 'Enter' && handleRestore()
                              }
                            />
                          </InputGroup>
                          <Button
                            variant="primary"
                            onClick={handleRestore}
                            disabled={
                              isRestoring ||
                              !restoreUsername ||
                              !restorePassword
                            }
                          >
                            <FontAwesomeIcon
                              icon={isRestoring ? faSpinner : faRotateLeft}
                              spin={isRestoring}
                            />{' '}
                            Restore Previous Security Settings
                          </Button>
                          {restoreError && (
                            <p className="text-danger mt-2">{restoreError}</p>
                          )}
                        </Alert>
                        <hr />
                        <p className="text-muted">
                          Or create a new admin account instead:
                        </p>
                      </div>
                    )}
                    {!loginStatus.securityWasEnabled && (
                      <Form action={submitAction}>
                        {!hasBackup && <h1>Enable Security</h1>}
                        <p className="text-muted">Create an admin account</p>
                        <InputGroup className="mb-3">
                          <InputGroup.Text>
                            <FontAwesomeIcon icon={faUser} />
                          </InputGroup.Text>
                          <Form.Control
                            type="text"
                            name="username"
                            placeholder="Username"
                            onChange={handleInputChange}
                            onKeyUp={handleInputKeyUp}
                          />
                        </InputGroup>
                        <InputGroup className="mb-4">
                          <InputGroup.Text>
                            <FontAwesomeIcon icon={faLock} />
                          </InputGroup.Text>
                          <Form.Control
                            type="password"
                            name="password"
                            placeholder="Password"
                            onChange={handleInputChange}
                            onKeyUp={handleInputKeyUp}
                          />
                        </InputGroup>
                        <Alert variant="warning" className="mb-4">
                          <Form.Check
                            type="checkbox"
                            id="allow-readonly"
                            label="Allow Readonly Access"
                            checked={allowReadonly}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              setAllowReadonly(e.target.checked)
                            }
                            className="mb-2"
                          />
                          <small className="d-block text-body-secondary">
                            When enabled, unauthenticated users can read Signal
                            K data and use webapps without logging in. This
                            exposes your data on the local network and
                            potentially on the public internet.
                          </small>
                          <small className="d-block text-body-secondary mt-1">
                            You can change this anytime in Security &gt;
                            Settings.
                          </small>
                        </Alert>
                        <Row>
                          <Col xs="6">
                            <Button
                              type="submit"
                              variant="primary"
                              className="px-4"
                              disabled={isEnabling}
                            >
                              <FontAwesomeIcon
                                icon={isEnabling ? faSpinner : faLock}
                                spin={isEnabling}
                              />{' '}
                              Enable
                            </Button>
                          </Col>
                          <Col xs="6" className="text-end">
                            <p className="text-danger">{state.error}</p>
                          </Col>
                        </Row>
                      </Form>
                    )}
                  </Card.Body>
                </Card>
              </CardGroup>
            </Col>
          </Row>
        </Container>
      )}
    </div>
  )
}
