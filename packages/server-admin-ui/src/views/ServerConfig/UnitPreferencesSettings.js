import React, { Component } from 'react'
import { connect } from 'react-redux'
import {
  Card,
  CardHeader,
  CardBody,
  Col,
  FormGroup,
  Button,
  Alert
} from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload, faTrash, faTimes } from '@fortawesome/free-solid-svg-icons'

const DEFAULT_PRESETS = [
  { value: 'metric', label: 'Metric (SI)' },
  { value: 'imperial-us', label: 'Imperial (US)' },
  { value: 'imperial-uk', label: 'Imperial (UK)' }
]

async function fetchPresets() {
  try {
    const response = await fetch('/signalk/v1/unitpreferences/presets', {
      credentials: 'include'
    })
    if (response.ok) {
      const data = await response.json()
      const presets = []
      if (data.builtIn) {
        data.builtIn.forEach((p) => {
          presets.push({
            value: typeof p === 'object' ? p.name : p,
            label: typeof p === 'object' ? p.displayName || p.name : p,
            isCustom: false
          })
        })
      }
      if (data.custom) {
        data.custom.forEach((p) => {
          presets.push({
            value: typeof p === 'object' ? p.name : p,
            label: typeof p === 'object' ? p.displayName || p.name : p,
            isCustom: true
          })
        })
      }
      return presets.length > 0 ? presets : DEFAULT_PRESETS
    }
  } catch (e) {
    console.error('Failed to fetch presets:', e)
  }
  return DEFAULT_PRESETS
}

async function fetchActivePreset() {
  // Try user-specific preference first (via applicationData API)
  try {
    const userResponse = await fetch(
      '/signalk/v1/applicationData/user/unitpreferences/1.0',
      { credentials: 'include' }
    )
    if (userResponse.ok) {
      const userConfig = await userResponse.json()
      if (userConfig.activePreset) {
        return userConfig.activePreset
      }
    }
  } catch (e) {
    // User preference not found, fall back to global
  }

  // Fall back to global config
  try {
    const response = await fetch('/signalk/v1/unitpreferences/config', {
      credentials: 'include'
    })
    if (response.ok) {
      const config = await response.json()
      return config.activePreset || 'nautical-metric'
    }
  } catch (e) {
    console.error('Failed to fetch unit preferences:', e)
  }
  return 'nautical-metric'
}

async function setActivePreset(preset) {
  try {
    await fetch('/signalk/v1/applicationData/user/unitpreferences/1.0', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activePreset: preset })
    })
  } catch (e) {
    console.error('Failed to set unit preferences:', e)
  }
}

class UnitPreferencesSettings extends Component {
  constructor(props) {
    super(props)
    this.state = {
      presets: DEFAULT_PRESETS,
      activePreset: 'nautical-metric',
      hasData: false,
      uploadStatus: null,
      uploadError: null,
      duplicatePresetName: null,
      pendingFile: null
    }
    this.handlePresetChange = this.handlePresetChange.bind(this)
    this.handleFileUpload = this.handleFileUpload.bind(this)
    this.handleDeletePreset = this.handleDeletePreset.bind(this)
    this.handleReplacePreset = this.handleReplacePreset.bind(this)
    this.dismissError = this.dismissError.bind(this)
    this.fileInputRef = React.createRef()
  }

  async componentDidMount() {
    const presets = await fetchPresets()
    const activePreset = await fetchActivePreset()
    this.setState({ presets, activePreset, hasData: true })
  }

  async handlePresetChange(preset) {
    await setActivePreset(preset)
    this.setState({ activePreset: preset })
  }

  async handleFileUpload(event) {
    const file = event.target.files[0]
    if (!file) return

    this.setState({
      uploadStatus: 'uploading',
      uploadError: null,
      duplicatePresetName: null,
      pendingFile: file
    })

    const formData = new FormData()
    formData.append('preset', file)

    try {
      const response = await fetch(
        '/signalk/v1/unitpreferences/presets/custom/upload',
        {
          method: 'POST',
          credentials: 'include',
          body: formData
        }
      )

      const result = await response.json()

      if (response.ok) {
        this.setState({
          uploadStatus: 'success',
          uploadError: null,
          pendingFile: null
        })
        // Refresh presets list
        const presets = await fetchPresets()
        this.setState({ presets })
        // Clear success status after 3 seconds
        setTimeout(() => this.setState({ uploadStatus: null }), 3000)
      } else if (response.status === 409 && result.error === 'duplicate') {
        // Duplicate preset - offer replace option
        this.setState({
          uploadStatus: 'duplicate',
          duplicatePresetName: result.existingName
        })
      } else {
        this.setState({
          uploadStatus: 'error',
          uploadError: result.error || 'Upload failed',
          pendingFile: null
        })
      }
    } catch (e) {
      this.setState({
        uploadStatus: 'error',
        uploadError: e.message || 'Upload failed',
        pendingFile: null
      })
    }

    // Reset file input
    if (this.fileInputRef.current) {
      this.fileInputRef.current.value = ''
    }
  }

  async handleDeletePreset(presetName) {
    if (!window.confirm(`Delete custom preset "${presetName}"?`)) {
      return
    }

    try {
      const response = await fetch(
        `/signalk/v1/unitpreferences/presets/custom/${presetName}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      )

      if (response.ok) {
        // Refresh presets list
        const presets = await fetchPresets()
        // If deleted preset was active, switch to metric
        const newActivePreset =
          this.state.activePreset === presetName
            ? 'metric'
            : this.state.activePreset
        if (newActivePreset !== this.state.activePreset) {
          await setActivePreset(newActivePreset)
        }
        this.setState({ presets, activePreset: newActivePreset })
      } else {
        const result = await response.json()
        this.setState({
          uploadStatus: 'error',
          uploadError: result.error || 'Delete failed'
        })
      }
    } catch (e) {
      this.setState({
        uploadStatus: 'error',
        uploadError: e.message || 'Delete failed'
      })
    }
  }

  async handleReplacePreset() {
    const { duplicatePresetName, pendingFile } = this.state
    if (!duplicatePresetName || !pendingFile) return

    this.setState({ uploadStatus: 'uploading' })

    try {
      // Delete existing preset first
      const deleteResponse = await fetch(
        `/signalk/v1/unitpreferences/presets/custom/${duplicatePresetName}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      )

      if (!deleteResponse.ok) {
        const result = await deleteResponse.json()
        this.setState({
          uploadStatus: 'error',
          uploadError: result.error || 'Failed to replace preset',
          duplicatePresetName: null,
          pendingFile: null
        })
        return
      }

      // Re-upload the file
      const formData = new FormData()
      formData.append('preset', pendingFile)

      const uploadResponse = await fetch(
        '/signalk/v1/unitpreferences/presets/custom/upload',
        {
          method: 'POST',
          credentials: 'include',
          body: formData
        }
      )

      const result = await uploadResponse.json()

      if (uploadResponse.ok) {
        this.setState({
          uploadStatus: 'success',
          uploadError: null,
          duplicatePresetName: null,
          pendingFile: null
        })
        const presets = await fetchPresets()
        this.setState({ presets })
        setTimeout(() => this.setState({ uploadStatus: null }), 3000)
      } else {
        this.setState({
          uploadStatus: 'error',
          uploadError: result.error || 'Upload failed',
          duplicatePresetName: null,
          pendingFile: null
        })
      }
    } catch (e) {
      this.setState({
        uploadStatus: 'error',
        uploadError: e.message || 'Replace failed',
        duplicatePresetName: null,
        pendingFile: null
      })
    }
  }

  dismissError() {
    this.setState({
      uploadStatus: null,
      uploadError: null,
      duplicatePresetName: null,
      pendingFile: null
    })
  }

  render() {
    if (!this.state.hasData) {
      return null
    }

    const { loginStatus } = this.props
    const isAdmin =
      !loginStatus.authenticationRequired ||
      (loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin')

    const colors = [
      '#28a745',
      '#007bff',
      '#6f42c1',
      '#fd7e14',
      '#20c997',
      '#e83e8c'
    ]

    return (
      <Card>
        <CardHeader>
          <i className="fa fa-sliders" />
          <strong>Unit Preferences</strong>
        </CardHeader>
        <CardBody>
          <FormGroup row>
            <Col md="2">Display Units</Col>
            <Col
              md="10"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap'
              }}
            >
              {this.state.presets.map((preset, index) => {
                const isActive = this.state.activePreset === preset.value
                const baseColor = preset.isCustom
                  ? '#6c757d'
                  : colors[index % colors.length]
                return (
                  <span
                    key={preset.value}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                      backgroundColor: isActive ? baseColor : 'transparent',
                      color: isActive ? 'white' : baseColor,
                      border: `2px solid ${baseColor}`,
                      opacity: isActive ? 1 : 0.7
                    }}
                    title={
                      preset.isCustom ? 'Custom preset' : 'Built-in preset'
                    }
                  >
                    {preset.isCustom && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          backgroundColor: isActive
                            ? 'rgba(255,255,255,0.3)'
                            : baseColor,
                          color: isActive ? 'white' : 'white'
                        }}
                      >
                        custom
                      </span>
                    )}
                    <span
                      onClick={() => this.handlePresetChange(preset.value)}
                      style={{ cursor: 'pointer' }}
                    >
                      {preset.label}
                    </span>
                    {preset.isCustom && isAdmin && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          this.handleDeletePreset(preset.value)
                        }}
                        style={{
                          cursor: 'pointer',
                          marginLeft: '4px',
                          opacity: 0.7
                        }}
                        title={`Delete ${preset.label}`}
                      >
                        <FontAwesomeIcon icon={faTrash} size="xs" />
                      </span>
                    )}
                  </span>
                )
              })}
            </Col>
          </FormGroup>

          {isAdmin && (
            <FormGroup row>
              <Col md="2">Upload Preset</Col>
              <Col md="10">
                <input
                  ref={this.fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={this.handleFileUpload}
                  style={{ display: 'none' }}
                  id="preset-upload"
                />
                <Button
                  color="primary"
                  size="sm"
                  onClick={() => this.fileInputRef.current?.click()}
                  disabled={this.state.uploadStatus === 'uploading'}
                >
                  <FontAwesomeIcon icon={faUpload} />{' '}
                  {this.state.uploadStatus === 'uploading'
                    ? 'Uploading...'
                    : 'Upload Custom Preset'}
                </Button>
                {this.state.uploadStatus === 'success' && (
                  <Alert
                    color="success"
                    style={{ marginTop: '10px', marginBottom: 0 }}
                  >
                    Preset uploaded successfully!
                  </Alert>
                )}
                {this.state.uploadStatus === 'duplicate' && (
                  <Alert
                    color="warning"
                    style={{ marginTop: '10px', marginBottom: 0 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span>
                        A preset named &quot;{this.state.duplicatePresetName}
                        &quot; already exists.
                      </span>
                      <span>
                        <Button
                          color="warning"
                          size="sm"
                          onClick={this.handleReplacePreset}
                          style={{ marginRight: '8px' }}
                        >
                          Replace
                        </Button>
                        <Button
                          color="secondary"
                          size="sm"
                          onClick={this.dismissError}
                        >
                          Cancel
                        </Button>
                      </span>
                    </div>
                  </Alert>
                )}
                {this.state.uploadStatus === 'error' && (
                  <Alert
                    color="danger"
                    style={{ marginTop: '10px', marginBottom: 0 }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start'
                      }}
                    >
                      <span style={{ whiteSpace: 'pre-wrap' }}>
                        {this.state.uploadError}
                      </span>
                      <span
                        onClick={this.dismissError}
                        style={{ cursor: 'pointer', marginLeft: '10px' }}
                        title="Dismiss"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                      </span>
                    </div>
                  </Alert>
                )}
              </Col>
            </FormGroup>
          )}
        </CardBody>
      </Card>
    )
  }
}

export default connect(({ loginStatus }) => ({ loginStatus }))(
  UnitPreferencesSettings
)
