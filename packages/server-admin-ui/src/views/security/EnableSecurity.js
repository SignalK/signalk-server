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
  InputGroupText,
} from 'reactstrap'
import { connect } from 'react-redux'
import { enableSecurity, fetchLoginStatus } from '../../actions'
import Login from './Login'

class EnableSecurity extends Component {
  constructor(props) {
    super(props)
    this.state = {
      enabling: false,
      errorMessage: null,
    }
    this.handleInputChange = this.handleInputChange.bind(this)
    this.handleInputKeyUp = this.handleInputKeyUp.bind(this)
    this.handleClick = this.handleClick.bind(this)
  }

  handleClick() {
    const { dispatch } = this.props
    this.setState({ enabling: true })
    enableSecurity(
      dispatch,
      this.state.username,
      this.state.password,
      (error) => {
        fetchLoginStatus(dispatch)
        this.setState({
          enabling: false,
          errorMessage: error,
        })
      }
    )
  }

  handleInputChange(event) {
    this.setState({ [event.target.name]: event.target.value })
  }
  handleInputKeyUp(event) {
    if (event.key === 'Enter') {
      this.handleClick()
    }
  }

  render() {
    return (
      <div>
        {this.props.loginStatus.authenticationRequired &&
          !this.props.loginStatus.noUsers && <Login />}
        {(this.props.loginStatus.authenticationRequired === false ||
          this.props.loginStatus.noUsers === true) && (
          <Container>
            <Row className="justify-content-center">
              <Col md="8">
                <CardGroup>
                  <Card className="p-4">
                    <CardBody>
                      {this.props.loginStatus.securityWasEnabled &&
                        this.props.loginStatus.authenticationRequired ==
                          false && (
                          <p className="text-danger">
                            Security has been enabled, please restart the server
                          </p>
                        )}
                      {!this.props.loginStatus.securityWasEnabled && (
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
                              onChange={this.handleInputChange}
                              onKeyUp={this.handleInputKeyUp}
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
                              onChange={this.handleInputChange}
                              onKeyUp={this.handleInputKeyUp}
                            />
                          </InputGroup>
                          <Row>
                            <Col xs="6">
                              <Button
                                onClick={this.handleClick}
                                color="primary"
                                className="px-4"
                              >
                                <i
                                  className={
                                    this.state.enabling
                                      ? 'fa fa-spinner fa-spin'
                                      : 'fa fa-lock'
                                  }
                                />{' '}
                                Enable
                              </Button>
                            </Col>
                            <Col xs="6" className="text-right">
                              <p className="text-danger">
                                {this.state.errorMessage}
                              </p>
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
}

export default connect(({ loginStatus }) => ({ loginStatus }))(EnableSecurity)
