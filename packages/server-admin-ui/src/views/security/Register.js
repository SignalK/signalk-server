import React, { Component } from 'react'
import {
  Container,
  Row,
  Col,
  Card,
  CardBody,
  CardFooter,
  Button,
  Form,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from 'reactstrap'

class Register extends Component {
  constructor(props) {
    super(props)
    this.state = {
      errorMessage: null,
      email: '',
      password: '',
      confirmPassword: '',
      registrationSent: false,
    }
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleCreate = this.handleCreate.bind(this)
  }

  handleInputChange(event) {
    var targetName = event.target.name
    this.setState({ [event.target.name]: event.target.value }, () => {
      if (
        targetName === 'password' ||
        (targetName === 'confirmPassword' &&
          this.state.password != this.state.confirmPassword)
      ) {
        this.setState({ errorMessage: 'Passwords do not match' })
      } else {
        this.setState({ errorMessage: null })
      }
    })
  }

  handleCreate(event) {
    if (this.state.email.length == 0) {
      this.setState({ errorMessage: 'Please enter an email address' })
    } else if (
      this.state.password.length == 0 &&
      this.state.confirmPassword.length == 0
    ) {
      this.setState({ errorMessage: 'Please enter and conform your password' })
    } else if (this.state.password != this.state.confirmPassword) {
      //error message is already thwre
      return
    } else {
      var payload = {
        userId: this.state.email,
        password: this.state.password,
      }
      fetch(`/signalk/v1/access/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      }).then((response) => {
        if (response.status != 202) {
          response.json().then((json) => {
            this.setState({
              errorMessage: json.message ? json.message : json.result,
            })
          })
        } else {
          this.setState({ registrationSent: true })
        }
      })
    }
  }

  render() {
    return (
      <div>
        <Container>
          <Row className="justify-content-center">
            <Col md="6">
              <Card className="mx-4">
                <CardBody className="p-4">
                  <h1>Register</h1>
                  {this.state.registrationSent && (
                    <p className="text-muted">
                      Your registration has been sent
                    </p>
                  )}
                  {!this.state.registrationSent && (
                    <Form>
                      <p className="text-muted">Create your account</p>
                      <InputGroup className="mb-3">
                        <InputGroupAddon addonType="prepend">
                          <InputGroupText>@</InputGroupText>
                        </InputGroupAddon>
                        <Input
                          name="email"
                          type="text"
                          placeholder="Email"
                          onChange={this.handleInputChange}
                        />
                      </InputGroup>
                      <InputGroup className="mb-3">
                        <InputGroupAddon addonType="prepend">
                          <InputGroupText>
                            <i className="icon-lock" />
                          </InputGroupText>
                        </InputGroupAddon>
                        <Input
                          name="password"
                          type="password"
                          placeholder="Password"
                          onChange={this.handleInputChange}
                        />
                      </InputGroup>
                      <InputGroup className="mb-0">
                        <InputGroupAddon addonType="prepend">
                          <InputGroupText>
                            <i className="icon-lock" />
                          </InputGroupText>
                        </InputGroupAddon>
                        <Input
                          name="confirmPassword"
                          type="password"
                          placeholder="Repeat password"
                          onChange={this.handleInputChange}
                        />
                      </InputGroup>
                      {this.state.errorMessage && (
                        <p className="text-danger mt-3 mb-0">
                          {this.state.errorMessage}
                        </p>
                      )}
                    </Form>
                  )}
                </CardBody>
                {!this.state.registrationSent && (
                  <CardFooter className="p-4">
                    <Row>
                      <Col xs="12" sm="12">
                        <Button
                          color="success"
                          block
                          onClick={this.handleCreate}
                        >
                          Create Account
                        </Button>
                      </Col>
                    </Row>
                  </CardFooter>
                )}
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    )
  }
}

export default Register
