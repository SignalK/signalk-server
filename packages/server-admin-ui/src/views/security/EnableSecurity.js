import React, { useState } from 'react'
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
import { useSelector, useDispatch } from 'react-redux'
import { enableSecurity, fetchLoginStatus } from '../../actions'
import Login from './Login'

const EnableSecurity = () => {
  const dispatch = useDispatch()
  const loginStatus = useSelector((state) => state.loginStatus)

  const [enabling, setEnabling] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleClick = () => {
    setEnabling(true)
    enableSecurity(dispatch, username, password, (error) => {
      fetchLoginStatus(dispatch)
      setEnabling(false)
      setErrorMessage(error)
    })
  }

  const handleInputChange = (event) => {
    const { name, value } = event.target
    if (name === 'username') setUsername(value)
    else if (name === 'password') setPassword(value)
  }

  const handleInputKeyUp = (event) => {
    if (event.key === 'Enter') {
      handleClick()
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
                      <Form>
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
                              onClick={handleClick}
                              color="primary"
                              className="px-4"
                            >
                              <i
                                className={
                                  enabling
                                    ? 'fa fa-spinner fa-spin'
                                    : 'fa fa-lock'
                                }
                              />{' '}
                              Enable
                            </Button>
                          </Col>
                          <Col xs="6" className="text-end">
                            <p className="text-danger">{errorMessage}</p>
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

export default EnableSecurity
