import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Alert,
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Input,
  Form,
  Col,
  Label,
  FormGroup,
  FormText,
  Collapse,
  Badge,
  Row
} from 'reactstrap'

class OIDCSettings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasData: false,
      isOpen: false,
      isSaving: false,
      isTesting: false,
      testResult: null,
      saveResult: null,
      // Form fields
      enabled: false,
      issuer: '',
      clientId: '',
      clientSecret: '',
      clientSecretSet: false,
      providerName: 'SSO Login',
      defaultPermission: 'readonly',
      autoCreateUsers: true,
      autoLogin: false,
      adminGroups: '',
      readwriteGroups: '',
      groupsAttribute: 'groups',
      scope: 'openid email profile',
      envOverrides: {}
    }

    this.handleChange = this.handleChange.bind(this)
    this.handleSaveConfig = this.handleSaveConfig.bind(this)
    this.handleTestConnection = this.handleTestConnection.bind(this)
    this.toggle = this.toggle.bind(this)
  }

  componentDidMount() {
    if (this.props.loginStatus.authenticationRequired) {
      this.fetchOIDCConfig()
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.props.loginStatus.authenticationRequired !==
      prevProps.loginStatus.authenticationRequired
    ) {
      this.fetchOIDCConfig()
    }
  }

  fetchOIDCConfig() {
    fetch(`${window.serverRoutesPrefix}/security/oidc`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data) => {
        this.setState({
          hasData: true,
          enabled: data.enabled || false,
          issuer: data.issuer || '',
          clientId: data.clientId || '',
          clientSecret: '',
          clientSecretSet: data.clientSecretSet || false,
          providerName: data.providerName || 'SSO Login',
          defaultPermission: data.defaultPermission || 'readonly',
          autoCreateUsers:
            data.autoCreateUsers !== undefined ? data.autoCreateUsers : true,
          autoLogin: data.autoLogin || false,
          adminGroups: Array.isArray(data.adminGroups)
            ? data.adminGroups.join(', ')
            : data.adminGroups || '',
          readwriteGroups: Array.isArray(data.readwriteGroups)
            ? data.readwriteGroups.join(', ')
            : data.readwriteGroups || '',
          groupsAttribute: data.groupsAttribute || 'groups',
          scope: data.scope || 'openid email profile',
          envOverrides: data.envOverrides || {}
        })
      })
      .catch((err) => {
        console.error('Failed to fetch OIDC config:', err)
      })
  }

  handleChange(event) {
    const value =
      event.target.type === 'checkbox'
        ? event.target.checked
        : event.target.value
    this.setState({ [event.target.name]: value })
  }

  handleSaveConfig() {
    this.setState({ isSaving: true, saveResult: null })

    const payload = {
      enabled: this.state.enabled,
      issuer: this.state.issuer,
      clientId: this.state.clientId,
      clientSecret: this.state.clientSecret,
      providerName: this.state.providerName,
      defaultPermission: this.state.defaultPermission,
      autoCreateUsers: this.state.autoCreateUsers,
      autoLogin: this.state.autoLogin,
      adminGroups: this.state.adminGroups,
      readwriteGroups: this.state.readwriteGroups,
      groupsAttribute: this.state.groupsAttribute,
      scope: this.state.scope
    }

    fetch(`${window.serverRoutesPrefix}/security/oidc`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'include'
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || 'Failed to save configuration')
          })
        }
        return response.json()
      })
      .then(() => {
        this.setState({
          isSaving: false,
          saveResult: { success: true, message: 'OIDC configuration saved' },
          clientSecret: '',
          clientSecretSet: true
        })
        this.fetchOIDCConfig()
      })
      .catch((err) => {
        this.setState({
          isSaving: false,
          saveResult: { success: false, message: err.message }
        })
      })
  }

  handleTestConnection() {
    if (!this.state.issuer) {
      this.setState({
        testResult: { success: false, message: 'Issuer URL is required' }
      })
      return
    }

    this.setState({ isTesting: true, testResult: null })

    fetch(`${window.serverRoutesPrefix}/security/oidc/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ issuer: this.state.issuer }),
      credentials: 'include'
    })
      .then((response) => {
        if (!response.ok) {
          return response.json().then((data) => {
            throw new Error(data.error || 'Connection test failed')
          })
        }
        return response.json()
      })
      .then((data) => {
        this.setState({
          isTesting: false,
          testResult: {
            success: true,
            message: `Connected to ${data.issuer}`,
            endpoints: {
              authorization: data.authorization_endpoint,
              token: data.token_endpoint
            }
          }
        })
      })
      .catch((err) => {
        this.setState({
          isTesting: false,
          testResult: { success: false, message: err.message }
        })
      })
  }

  toggle() {
    this.setState({ isOpen: !this.state.isOpen })
  }

  isFieldDisabled(fieldName) {
    return this.state.envOverrides[fieldName] === true
  }

  renderEnvBadge(fieldName) {
    if (this.state.envOverrides[fieldName]) {
      return (
        <Badge
          color="warning"
          className="ml-2"
          title="Set via environment variable"
        >
          ENV
        </Badge>
      )
    }
    return null
  }

  render() {
    if (!this.state.hasData || !this.props.loginStatus.authenticationRequired) {
      return null
    }

    return (
      <Card>
        <CardHeader onClick={this.toggle} style={{ cursor: 'pointer' }}>
          <i className="fa fa-openid" /> OIDC / SSO Authentication
          <span className="float-right">
            {this.state.enabled && (
              <Badge color="success" className="mr-2">
                Enabled
              </Badge>
            )}
            <i
              className={`fa fa-chevron-${this.state.isOpen ? 'up' : 'down'}`}
            />
          </span>
        </CardHeader>
        <Collapse isOpen={this.state.isOpen}>
          <CardBody>
            <Form
              action=""
              method="post"
              encType="multipart/form-data"
              className="form-horizontal"
            >
              <FormGroup row>
                <Col xs="0" md="3">
                  <Label>Enable OIDC</Label>
                  {this.renderEnvBadge('enabled')}
                </Col>
                <Col md="9">
                  <FormGroup check>
                    <div>
                      <Label className="switch switch-text switch-primary">
                        <Input
                          type="checkbox"
                          name="enabled"
                          className="switch-input"
                          onChange={this.handleChange}
                          checked={this.state.enabled}
                          disabled={this.isFieldDisabled('enabled')}
                        />
                        <span
                          className="switch-label"
                          data-on="Yes"
                          data-off="No"
                        />
                        <span className="switch-handle" />
                      </Label>
                    </div>
                  </FormGroup>
                  <FormText color="muted">
                    Enable OpenID Connect authentication
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="issuer">Issuer URL</Label>
                  {this.renderEnvBadge('issuer')}
                </Col>
                <Col xs="12" md="9">
                  <Row>
                    <Col md="8">
                      <Input
                        type="text"
                        name="issuer"
                        placeholder="https://auth.example.com"
                        onChange={this.handleChange}
                        value={this.state.issuer}
                        disabled={this.isFieldDisabled('issuer')}
                      />
                    </Col>
                    <Col md="4">
                      <Button
                        color="secondary"
                        onClick={this.handleTestConnection}
                        disabled={this.state.isTesting || !this.state.issuer}
                      >
                        <i
                          className={`fa fa-${this.state.isTesting ? 'spinner fa-spin' : 'plug'}`}
                        />{' '}
                        Test Connection
                      </Button>
                    </Col>
                  </Row>
                  <FormText color="muted">
                    The OIDC provider&apos;s issuer URL (e.g., Keycloak,
                    Authentik)
                  </FormText>
                  {this.state.testResult && (
                    <Alert
                      color={
                        this.state.testResult.success ? 'success' : 'danger'
                      }
                      className="mt-2"
                    >
                      {this.state.testResult.message}
                    </Alert>
                  )}
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="clientId">Client ID</Label>
                  {this.renderEnvBadge('clientId')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="text"
                    name="clientId"
                    placeholder="signalk-server"
                    onChange={this.handleChange}
                    value={this.state.clientId}
                    disabled={this.isFieldDisabled('clientId')}
                  />
                  <FormText color="muted">
                    Client ID from your OIDC provider
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="clientSecret">Client Secret</Label>
                  {this.renderEnvBadge('clientSecret')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="password"
                    name="clientSecret"
                    placeholder={
                      this.state.clientSecretSet
                        ? '••••••••••••••••'
                        : 'Enter client secret'
                    }
                    onChange={this.handleChange}
                    value={this.state.clientSecret}
                    disabled={this.isFieldDisabled('clientSecret')}
                  />
                  <FormText color="muted">
                    {this.state.clientSecretSet
                      ? 'Leave empty to keep existing secret'
                      : 'Client secret from your OIDC provider'}
                  </FormText>
                  <FormText>
                    <strong>Recommended:</strong> Set via environment variable{' '}
                    <code>SIGNALK_OIDC_CLIENT_SECRET</code> instead of storing
                    in configuration.
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="providerName">Provider Display Name</Label>
                  {this.renderEnvBadge('providerName')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="text"
                    name="providerName"
                    placeholder="SSO Login"
                    onChange={this.handleChange}
                    value={this.state.providerName}
                    disabled={this.isFieldDisabled('providerName')}
                  />
                  <FormText color="muted">
                    Text shown on the SSO login button
                  </FormText>
                </Col>
              </FormGroup>

              <hr />
              <h5>Permission Mapping</h5>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="defaultPermission">Default Permission</Label>
                  {this.renderEnvBadge('defaultPermission')}
                </Col>
                <Col xs="12" md="4">
                  <Input
                    type="select"
                    name="defaultPermission"
                    value={this.state.defaultPermission}
                    onChange={this.handleChange}
                    disabled={this.isFieldDisabled('defaultPermission')}
                  >
                    <option value="readonly">Read Only</option>
                    <option value="readwrite">Read/Write</option>
                    <option value="admin">Admin</option>
                  </Input>
                  <FormText color="muted">
                    Permission for users not matching any group mapping
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="adminGroups">Admin Groups</Label>
                  {this.renderEnvBadge('adminGroups')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="text"
                    name="adminGroups"
                    placeholder="admins, sk-admin"
                    onChange={this.handleChange}
                    value={this.state.adminGroups}
                    disabled={this.isFieldDisabled('adminGroups')}
                  />
                  <FormText color="muted">
                    Comma-separated list of groups that grant admin permission
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="readwriteGroups">Read/Write Groups</Label>
                  {this.renderEnvBadge('readwriteGroups')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="text"
                    name="readwriteGroups"
                    placeholder="users, operators"
                    onChange={this.handleChange}
                    value={this.state.readwriteGroups}
                    disabled={this.isFieldDisabled('readwriteGroups')}
                  />
                  <FormText color="muted">
                    Comma-separated list of groups that grant read/write
                    permission
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="groupsAttribute">Groups Attribute</Label>
                  {this.renderEnvBadge('groupsAttribute')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="text"
                    name="groupsAttribute"
                    placeholder="groups"
                    onChange={this.handleChange}
                    value={this.state.groupsAttribute}
                    disabled={this.isFieldDisabled('groupsAttribute')}
                  />
                  <FormText color="muted">
                    ID token claim containing user groups (e.g., groups, roles,
                    memberOf)
                  </FormText>
                </Col>
              </FormGroup>

              <hr />
              <h5>User Settings</h5>

              <FormGroup row>
                <Col xs="0" md="3">
                  <Label>Auto-Create Users</Label>
                  {this.renderEnvBadge('autoCreateUsers')}
                </Col>
                <Col md="9">
                  <FormGroup check>
                    <div>
                      <Label className="switch switch-text switch-primary">
                        <Input
                          type="checkbox"
                          name="autoCreateUsers"
                          className="switch-input"
                          onChange={this.handleChange}
                          checked={this.state.autoCreateUsers}
                          disabled={this.isFieldDisabled('autoCreateUsers')}
                        />
                        <span
                          className="switch-label"
                          data-on="Yes"
                          data-off="No"
                        />
                        <span className="switch-handle" />
                      </Label>
                    </div>
                  </FormGroup>
                  <FormText color="muted">
                    Automatically create local user on first OIDC login
                  </FormText>
                </Col>
              </FormGroup>

              <FormGroup row>
                <Col xs="0" md="3">
                  <Label>Auto-Login</Label>
                  {this.renderEnvBadge('autoLogin')}
                </Col>
                <Col md="9">
                  <FormGroup check>
                    <div>
                      <Label className="switch switch-text switch-primary">
                        <Input
                          type="checkbox"
                          name="autoLogin"
                          className="switch-input"
                          onChange={this.handleChange}
                          checked={this.state.autoLogin}
                          disabled={this.isFieldDisabled('autoLogin')}
                        />
                        <span
                          className="switch-label"
                          data-on="Yes"
                          data-off="No"
                        />
                        <span className="switch-handle" />
                      </Label>
                    </div>
                  </FormGroup>
                  <FormText color="muted">
                    Automatically redirect to OIDC login when not authenticated
                  </FormText>
                </Col>
              </FormGroup>

              <hr />
              <h5>Advanced</h5>

              <FormGroup row>
                <Col md="3">
                  <Label htmlFor="scope">Scope</Label>
                  {this.renderEnvBadge('scope')}
                </Col>
                <Col xs="12" md="9">
                  <Input
                    type="text"
                    name="scope"
                    placeholder="openid email profile"
                    onChange={this.handleChange}
                    value={this.state.scope}
                    disabled={this.isFieldDisabled('scope')}
                  />
                  <FormText color="muted">
                    Space-separated OAuth scopes (must include
                    &apos;openid&apos;)
                  </FormText>
                </Col>
              </FormGroup>
            </Form>
          </CardBody>
          <CardFooter>
            {this.state.saveResult && (
              <Alert
                color={this.state.saveResult.success ? 'success' : 'danger'}
                className="mb-2"
              >
                {this.state.saveResult.message}
              </Alert>
            )}
            <Button
              size="sm"
              color="primary"
              onClick={this.handleSaveConfig}
              disabled={this.state.isSaving}
            >
              <i
                className={`fa fa-${this.state.isSaving ? 'spinner fa-spin' : 'dot-circle-o'}`}
              />{' '}
              Save
            </Button>
          </CardFooter>
        </Collapse>
      </Card>
    )
  }
}

const mapStateToProps = ({ loginStatus }) => ({ loginStatus })

export default connect(mapStateToProps)(OIDCSettings)
