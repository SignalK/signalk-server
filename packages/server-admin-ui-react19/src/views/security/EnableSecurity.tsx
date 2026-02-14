import { useState, useActionState, ChangeEvent, KeyboardEvent } from 'react'
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
  InputGroupText
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import { useLoginStatus } from '../../store'
import { enableSecurity } from '../../actions'
import Login from './Login'

interface EnableSecurityState {
  error: string | null
}

export default function EnableSecurity() {
  const loginStatus = useLoginStatus()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const [state, submitAction, isEnabling] = useActionState<
    EnableSecurityState,
    FormData
  >(
    async () => {
      const error = await enableSecurity(username, password)
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
                  <CardBody>
                    {loginStatus.securityWasEnabled &&
                      loginStatus.authenticationRequired === false && (
                        <p className="text-danger">
                          Security has been enabled, please restart the server
                        </p>
                      )}
                    {!loginStatus.securityWasEnabled && (
                      <Form action={submitAction}>
                        <h1>Enable Security</h1>
                        <p className="text-muted">Create an admin account</p>
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
                          />
                        </InputGroup>
                        <Row>
                          <Col xs="6">
                            <Button
                              type="submit"
                              color="primary"
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
                  </CardBody>
                </Card>
              </CardGroup>
            </Col>
          </Row>
        </Container>
      )}
    </div>
  )
}
