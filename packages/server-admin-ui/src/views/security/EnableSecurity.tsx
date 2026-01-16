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
import { useAppSelector, useAppDispatch } from '../../store'
import { enableSecurity, fetchLoginStatus } from '../../actions'
import Login from './Login'

interface EnableSecurityState {
  error: string | null
}

export default function EnableSecurity() {
  const dispatch = useAppDispatch()
  const loginStatus = useAppSelector((state) => state.loginStatus)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const [state, submitAction, isEnabling] = useActionState<
    EnableSecurityState,
    FormData
  >(
    async (_prevState) => {
      return new Promise<EnableSecurityState>((resolve) => {
        enableSecurity(dispatch, username, password, (error: string | null) => {
          fetchLoginStatus(dispatch)
          resolve({ error })
        })
      })
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
      // Submit the form programmatically
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
                          <Col xs="6">
                            <Button
                              type="submit"
                              color="primary"
                              className="px-4"
                              disabled={isEnabling}
                            >
                              <i
                                className={
                                  isEnabling
                                    ? 'fa fa-spinner fa-spin'
                                    : 'fa fa-lock'
                                }
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
