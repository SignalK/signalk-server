import React, { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
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
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronUp } from '@fortawesome/free-solid-svg-icons/faChevronUp'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown'
import { faPlug } from '@fortawesome/free-solid-svg-icons/faPlug'
import { faSpinner } from '@fortawesome/free-solid-svg-icons/faSpinner'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { faOpenid } from '@fortawesome/free-brands-svg-icons/faOpenid'

interface LoginStatus {
  authenticationRequired: boolean
  status: string
  userLevel: string
}

interface RootState {
  loginStatus: LoginStatus
}

interface TestResult {
  success: boolean
  message: string
  endpoints?: {
    authorization: string
    token: string
  }
}

interface SaveResult {
  success: boolean
  message: string
}

interface EnvOverrides {
  [key: string]: boolean
}

interface OIDCConfig {
  enabled: boolean
  issuer: string
  clientId: string
  clientSecretSet: boolean
  providerName: string
  defaultPermission: string
  autoCreateUsers: boolean
  autoLogin: boolean
  adminGroups: string | string[]
  readwriteGroups: string | string[]
  groupsAttribute: string
  scope: string
  envOverrides: EnvOverrides
}

const OIDCSettings: React.FC = () => {
  const loginStatus = useSelector((state: RootState) => state.loginStatus)

  const [hasData, setHasData] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)

  // Form fields
  const [enabled, setEnabled] = useState(false)
  const [issuer, setIssuer] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [clientSecretSet, setClientSecretSet] = useState(false)
  const [providerName, setProviderName] = useState('SSO Login')
  const [defaultPermission, setDefaultPermission] = useState('readonly')
  const [autoCreateUsers, setAutoCreateUsers] = useState(true)
  const [autoLogin, setAutoLogin] = useState(false)
  const [adminGroups, setAdminGroups] = useState('')
  const [readwriteGroups, setReadwriteGroups] = useState('')
  const [groupsAttribute, setGroupsAttribute] = useState('groups')
  const [scope, setScope] = useState('openid email profile')
  const [envOverrides, setEnvOverrides] = useState<EnvOverrides>({})

  const fetchOIDCConfig = useCallback(() => {
    fetch(`${window.serverRoutesPrefix}/security/oidc`, {
      credentials: 'include'
    })
      .then((response) => response.json())
      .then((data: OIDCConfig) => {
        setHasData(true)
        setEnabled(data.enabled || false)
        setIssuer(data.issuer || '')
        setClientId(data.clientId || '')
        setClientSecret('')
        setClientSecretSet(data.clientSecretSet || false)
        setProviderName(data.providerName || 'SSO Login')
        setDefaultPermission(data.defaultPermission || 'readonly')
        setAutoCreateUsers(
          data.autoCreateUsers !== undefined ? data.autoCreateUsers : true
        )
        setAutoLogin(data.autoLogin || false)
        setAdminGroups(
          Array.isArray(data.adminGroups)
            ? data.adminGroups.join(', ')
            : data.adminGroups || ''
        )
        setReadwriteGroups(
          Array.isArray(data.readwriteGroups)
            ? data.readwriteGroups.join(', ')
            : data.readwriteGroups || ''
        )
        setGroupsAttribute(data.groupsAttribute || 'groups')
        setScope(data.scope || 'openid email profile')
        setEnvOverrides(data.envOverrides || {})
      })
      .catch((err) => {
        console.error('Failed to fetch OIDC config:', err)
      })
  }, [])

  useEffect(() => {
    if (loginStatus.authenticationRequired) {
      fetchOIDCConfig()
    }
  }, [loginStatus.authenticationRequired, fetchOIDCConfig])

  const handleSaveConfig = useCallback(() => {
    setIsSaving(true)
    setSaveResult(null)

    const payload = {
      enabled,
      issuer,
      clientId,
      clientSecret,
      providerName,
      defaultPermission,
      autoCreateUsers,
      autoLogin,
      adminGroups,
      readwriteGroups,
      groupsAttribute,
      scope
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
        setIsSaving(false)
        setSaveResult({ success: true, message: 'OIDC configuration saved' })
        setClientSecret('')
        setClientSecretSet(true)
        fetchOIDCConfig()
      })
      .catch((err) => {
        setIsSaving(false)
        setSaveResult({ success: false, message: err.message })
      })
  }, [
    enabled,
    issuer,
    clientId,
    clientSecret,
    providerName,
    defaultPermission,
    autoCreateUsers,
    autoLogin,
    adminGroups,
    readwriteGroups,
    groupsAttribute,
    scope,
    fetchOIDCConfig
  ])

  const handleTestConnection = useCallback(() => {
    if (!issuer) {
      setTestResult({ success: false, message: 'Issuer URL is required' })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    fetch(`${window.serverRoutesPrefix}/security/oidc/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ issuer }),
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
        setIsTesting(false)
        setTestResult({
          success: true,
          message: `Connected to ${data.issuer}`,
          endpoints: {
            authorization: data.authorization_endpoint,
            token: data.token_endpoint
          }
        })
      })
      .catch((err) => {
        setIsTesting(false)
        setTestResult({ success: false, message: err.message })
      })
  }, [issuer])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const isFieldDisabled = useCallback(
    (fieldName: string) => {
      return envOverrides[fieldName] === true
    },
    [envOverrides]
  )

  const renderEnvBadge = useCallback(
    (fieldName: string) => {
      if (envOverrides[fieldName]) {
        return (
          <Badge
            color="warning"
            className="ms-2"
            title="Set via environment variable"
          >
            ENV
          </Badge>
        )
      }
      return null
    },
    [envOverrides]
  )

  if (!hasData || !loginStatus.authenticationRequired) {
    return null
  }

  return (
    <Card>
      <CardHeader onClick={toggle} style={{ cursor: 'pointer' }}>
        <FontAwesomeIcon icon={faOpenid} /> OIDC / SSO Authentication
        <span className="float-end">
          {enabled && (
            <Badge color="success" className="me-2">
              Enabled
            </Badge>
          )}
          <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} />
        </span>
      </CardHeader>
      <Collapse isOpen={isOpen}>
        <CardBody>
          <Form
            action=""
            method="post"
            encType="multipart/form-data"
            className="form-horizontal"
          >
            <FormGroup row>
              <Col xs="0" md="3">
                <span className="col-form-label">Enable OIDC</span>
                {renderEnvBadge('enabled')}
              </Col>
              <Col md="9">
                <div className="d-flex align-items-center">
                  <Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <Input
                      type="checkbox"
                      id="oidc-enabled"
                      name="enabled"
                      className="switch-input"
                      onChange={(e) => setEnabled(e.target.checked)}
                      checked={enabled}
                      disabled={isFieldDisabled('enabled')}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>
                </div>
                <FormText color="muted">
                  Enable OpenID Connect authentication
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col md="3">
                <Label htmlFor="issuer">Issuer URL</Label>
                {renderEnvBadge('issuer')}
              </Col>
              <Col xs="12" md="9">
                <Row>
                  <Col md="8">
                    <Input
                      type="text"
                      id="issuer"
                      name="issuer"
                      autoComplete="off"
                      placeholder="https://auth.example.com"
                      onChange={(e) => setIssuer(e.target.value)}
                      value={issuer}
                      disabled={isFieldDisabled('issuer')}
                    />
                  </Col>
                  <Col md="4">
                    <Button
                      color="secondary"
                      onClick={handleTestConnection}
                      disabled={isTesting || !issuer}
                    >
                      <FontAwesomeIcon
                        icon={isTesting ? faSpinner : faPlug}
                        spin={isTesting}
                      />{' '}
                      Test Connection
                    </Button>
                  </Col>
                </Row>
                <FormText color="muted">
                  The OIDC provider&apos;s issuer URL (e.g., Keycloak,
                  Authentik)
                </FormText>
                {testResult && (
                  <Alert
                    color={testResult.success ? 'success' : 'danger'}
                    className="mt-2"
                  >
                    {testResult.message}
                  </Alert>
                )}
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col md="3">
                <Label htmlFor="clientId">Client ID</Label>
                {renderEnvBadge('clientId')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="text"
                  id="clientId"
                  name="clientId"
                  autoComplete="off"
                  placeholder="signalk-server"
                  onChange={(e) => setClientId(e.target.value)}
                  value={clientId}
                  disabled={isFieldDisabled('clientId')}
                />
                <FormText color="muted">
                  Client ID from your OIDC provider
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col md="3">
                <Label htmlFor="clientSecret">Client Secret</Label>
                {renderEnvBadge('clientSecret')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="password"
                  id="clientSecret"
                  name="clientSecret"
                  autoComplete="new-password"
                  placeholder={
                    clientSecretSet ? '••••••••••••••••' : 'Enter client secret'
                  }
                  onChange={(e) => setClientSecret(e.target.value)}
                  value={clientSecret}
                  disabled={isFieldDisabled('clientSecret')}
                />
                <FormText color="muted">
                  {clientSecretSet
                    ? 'Leave empty to keep existing secret'
                    : 'Client secret from your OIDC provider'}
                </FormText>
                <FormText>
                  <strong>Recommended:</strong> Set via environment variable{' '}
                  <code>SIGNALK_OIDC_CLIENT_SECRET</code> instead of storing in
                  configuration.
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col md="3">
                <Label htmlFor="providerName">Provider Display Name</Label>
                {renderEnvBadge('providerName')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="text"
                  id="providerName"
                  name="providerName"
                  autoComplete="off"
                  placeholder="SSO Login"
                  onChange={(e) => setProviderName(e.target.value)}
                  value={providerName}
                  disabled={isFieldDisabled('providerName')}
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
                {renderEnvBadge('defaultPermission')}
              </Col>
              <Col xs="12" md="4">
                <Input
                  type="select"
                  id="defaultPermission"
                  name="defaultPermission"
                  value={defaultPermission}
                  onChange={(e) => setDefaultPermission(e.target.value)}
                  disabled={isFieldDisabled('defaultPermission')}
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
                {renderEnvBadge('adminGroups')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="text"
                  id="adminGroups"
                  name="adminGroups"
                  autoComplete="off"
                  placeholder="admins, sk-admin"
                  onChange={(e) => setAdminGroups(e.target.value)}
                  value={adminGroups}
                  disabled={isFieldDisabled('adminGroups')}
                />
                <FormText color="muted">
                  Comma-separated list of groups that grant admin permission
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col md="3">
                <Label htmlFor="readwriteGroups">Read/Write Groups</Label>
                {renderEnvBadge('readwriteGroups')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="text"
                  id="readwriteGroups"
                  name="readwriteGroups"
                  autoComplete="off"
                  placeholder="users, operators"
                  onChange={(e) => setReadwriteGroups(e.target.value)}
                  value={readwriteGroups}
                  disabled={isFieldDisabled('readwriteGroups')}
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
                {renderEnvBadge('groupsAttribute')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="text"
                  id="groupsAttribute"
                  name="groupsAttribute"
                  autoComplete="off"
                  placeholder="groups"
                  onChange={(e) => setGroupsAttribute(e.target.value)}
                  value={groupsAttribute}
                  disabled={isFieldDisabled('groupsAttribute')}
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
                <span className="col-form-label">Auto-Create Users</span>
                {renderEnvBadge('autoCreateUsers')}
              </Col>
              <Col md="9">
                <div className="d-flex align-items-center">
                  <Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <Input
                      type="checkbox"
                      id="oidc-autoCreateUsers"
                      name="autoCreateUsers"
                      className="switch-input"
                      onChange={(e) => setAutoCreateUsers(e.target.checked)}
                      checked={autoCreateUsers}
                      disabled={isFieldDisabled('autoCreateUsers')}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>
                </div>
                <FormText color="muted">
                  Automatically create local user on first OIDC login
                </FormText>
              </Col>
            </FormGroup>

            <FormGroup row>
              <Col xs="0" md="3">
                <span className="col-form-label">Auto-Login</span>
                {renderEnvBadge('autoLogin')}
              </Col>
              <Col md="9">
                <div className="d-flex align-items-center">
                  <Label
                    style={{ marginRight: '15px', marginBottom: 0 }}
                    className="switch switch-text switch-primary"
                  >
                    <Input
                      type="checkbox"
                      id="oidc-autoLogin"
                      name="autoLogin"
                      className="switch-input"
                      onChange={(e) => setAutoLogin(e.target.checked)}
                      checked={autoLogin}
                      disabled={isFieldDisabled('autoLogin')}
                    />
                    <span
                      className="switch-label"
                      data-on="Yes"
                      data-off="No"
                    />
                    <span className="switch-handle" />
                  </Label>
                </div>
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
                {renderEnvBadge('scope')}
              </Col>
              <Col xs="12" md="9">
                <Input
                  type="text"
                  id="scope"
                  name="scope"
                  autoComplete="off"
                  placeholder="openid email profile"
                  onChange={(e) => setScope(e.target.value)}
                  value={scope}
                  disabled={isFieldDisabled('scope')}
                />
                <FormText color="muted">
                  Space-separated OAuth scopes (must include &apos;openid&apos;)
                </FormText>
              </Col>
            </FormGroup>
          </Form>
        </CardBody>
        <CardFooter>
          {saveResult && (
            <Alert
              color={saveResult.success ? 'success' : 'danger'}
              className="mb-2"
            >
              {saveResult.message}
            </Alert>
          )}
          <Button
            size="sm"
            color="primary"
            onClick={handleSaveConfig}
            disabled={isSaving}
          >
            <FontAwesomeIcon
              icon={isSaving ? faSpinner : faFloppyDisk}
              spin={isSaving}
            />{' '}
            Save
          </Button>
        </CardFooter>
      </Collapse>
    </Card>
  )
}

export default OIDCSettings
