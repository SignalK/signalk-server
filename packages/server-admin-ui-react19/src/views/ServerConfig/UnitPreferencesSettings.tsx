import React, { useState, useEffect, useRef, useCallback } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faUpload } from '@fortawesome/free-solid-svg-icons/faUpload'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'
import { faTimes } from '@fortawesome/free-solid-svg-icons/faTimes'
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders'
import {
  useLoginStatus,
  useActivePreset,
  useServerDefaultPreset,
  usePresets,
  useStore
} from '../../store'

type UploadStatus = 'uploading' | 'success' | 'duplicate' | 'error' | null

const UnitPreferencesSettings: React.FC = () => {
  const loginStatus = useLoginStatus()
  const activePreset = useActivePreset()
  const serverDefaultPreset = useServerDefaultPreset()
  const presets = usePresets()
  const unitPrefsLoaded = useStore((s) => s.unitPrefsLoaded)
  const fetchUnitPreferences = useStore((s) => s.fetchUnitPreferences)
  const setActivePresetAndSave = useStore((s) => s.setActivePresetAndSave)
  const setServerDefaultPreset = useStore((s) => s.setServerDefaultPreset)
  const setPresets = useStore((s) => s.setPresets)

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [duplicatePresetName, setDuplicatePresetName] = useState<string | null>(
    null
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [updateServerDefault, setUpdateServerDefault] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (loginStatus.status === 'loggedIn') {
      fetchUnitPreferences()
    }
  }, [fetchUnitPreferences, loginStatus.status, loginStatus.username])

  const isAdmin =
    !loginStatus.authenticationRequired ||
    (loginStatus.status === 'loggedIn' &&
      (loginStatus as Record<string, unknown>).userLevel === 'admin')

  const handlePresetChange = useCallback(
    async (preset: string) => {
      await setActivePresetAndSave(preset)
      if (updateServerDefault) {
        await setServerDefaultPreset(preset)
      }
    },
    [setActivePresetAndSave, setServerDefaultPreset, updateServerDefault]
  )

  const refreshPresets = useCallback(async () => {
    try {
      const response = await fetch('/signalk/v1/unitpreferences/presets', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        const fetched = []
        if (data.builtIn) {
          for (const p of data.builtIn) {
            fetched.push({
              name: typeof p === 'object' ? p.name : p,
              label: typeof p === 'object' ? p.displayName || p.name : p,
              isCustom: false,
              isBuiltIn: true
            })
          }
        }
        if (data.custom) {
          for (const p of data.custom) {
            fetched.push({
              name: typeof p === 'object' ? p.name : p,
              label: typeof p === 'object' ? p.displayName || p.name : p,
              isCustom: true,
              isBuiltIn: false
            })
          }
        }
        if (fetched.length > 0) {
          setPresets(fetched)
        }
      }
    } catch (e) {
      console.error('Failed to refresh presets:', e)
    }
  }, [setPresets])

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      setUploadStatus('uploading')
      setUploadError(null)
      setDuplicatePresetName(null)
      setPendingFile(file)

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
          setUploadStatus('success')
          setUploadError(null)
          setPendingFile(null)
          await refreshPresets()
          setTimeout(() => setUploadStatus(null), 3000)
        } else if (response.status === 409 && result.error === 'duplicate') {
          setUploadStatus('duplicate')
          setDuplicatePresetName(result.existingName)
        } else {
          setUploadStatus('error')
          setUploadError(result.error || 'Upload failed')
          setPendingFile(null)
        }
      } catch (e) {
        setUploadStatus('error')
        setUploadError(e instanceof Error ? e.message : 'Upload failed')
        setPendingFile(null)
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [refreshPresets]
  )

  const handleDeletePreset = useCallback(
    async (presetName: string) => {
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
          await refreshPresets()
          if (activePreset === presetName) {
            await setActivePresetAndSave('metric')
          }
        } else {
          const result = await response.json()
          setUploadStatus('error')
          setUploadError(result.error || 'Delete failed')
        }
      } catch (e) {
        setUploadStatus('error')
        setUploadError(e instanceof Error ? e.message : 'Delete failed')
      }
    },
    [activePreset, refreshPresets, setActivePresetAndSave]
  )

  const handleReplacePreset = useCallback(async () => {
    if (!duplicatePresetName || !pendingFile) return

    setUploadStatus('uploading')

    try {
      const deleteResponse = await fetch(
        `/signalk/v1/unitpreferences/presets/custom/${duplicatePresetName}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      )

      if (!deleteResponse.ok) {
        const result = await deleteResponse.json()
        setUploadStatus('error')
        setUploadError(result.error || 'Failed to replace preset')
        setDuplicatePresetName(null)
        setPendingFile(null)
        return
      }

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
        setUploadStatus('success')
        setUploadError(null)
        setDuplicatePresetName(null)
        setPendingFile(null)
        await refreshPresets()
        setTimeout(() => setUploadStatus(null), 3000)
      } else {
        setUploadStatus('error')
        setUploadError(result.error || 'Upload failed')
        setDuplicatePresetName(null)
        setPendingFile(null)
      }
    } catch (e) {
      setUploadStatus('error')
      setUploadError(e instanceof Error ? e.message : 'Replace failed')
      setDuplicatePresetName(null)
      setPendingFile(null)
    }
  }, [duplicatePresetName, pendingFile, refreshPresets])

  const dismissError = useCallback(() => {
    setUploadStatus(null)
    setUploadError(null)
    setDuplicatePresetName(null)
    setPendingFile(null)
  }, [])

  if (!unitPrefsLoaded) {
    return null
  }

  const builtInPresets = presets.filter((p) => !p.isCustom)
  const customPresets = presets.filter((p) => p.isCustom)
  const activeCustomPreset = customPresets.find((p) => p.name === activePreset)

  return (
    <Card>
      <Card.Header>
        <FontAwesomeIcon icon={faSliders} /> <strong>Unit Preferences</strong>
      </Card.Header>
      <Card.Body>
        <Form.Group as={Row} className="mb-3">
          <Col md={2}>
            <Form.Label>Display Units</Form.Label>
          </Col>
          <Col xs="12" md={10}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Form.Select
                value={activePreset}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  handlePresetChange(e.target.value)
                }
                style={{ maxWidth: '300px' }}
              >
                <optgroup label="Built-in">
                  {builtInPresets.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
                {customPresets.length > 0 && (
                  <optgroup label="Custom">
                    {customPresets.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Form.Select>
              {isAdmin && activeCustomPreset && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDeletePreset(activePreset)}
                  title={`Delete ${activeCustomPreset.label}`}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              )}
            </div>
            {isAdmin && (
              <div style={{ marginTop: '10px' }}>
                <Form.Check
                  type="checkbox"
                  id="updateServerDefault"
                  checked={updateServerDefault}
                  onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                    const checked = e.target.checked
                    setUpdateServerDefault(checked)
                    if (checked) {
                      await setServerDefaultPreset(activePreset)
                    }
                  }}
                  label="Also set as server default (for new users)"
                />
                <Form.Text className="text-muted">
                  Current server default: {serverDefaultPreset}
                </Form.Text>
              </div>
            )}
            {isAdmin && (
              <div style={{ marginTop: '10px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
                <Form.Text
                  className="text-muted"
                  style={{ marginRight: '8px' }}
                >
                  Add custom preset
                </Form.Text>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadStatus === 'uploading'}
                >
                  <FontAwesomeIcon icon={faUpload} />{' '}
                  {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            )}
            {uploadStatus === 'success' && (
              <Alert
                variant="success"
                style={{ marginTop: '10px', marginBottom: 0 }}
              >
                Preset uploaded successfully!
              </Alert>
            )}
            {uploadStatus === 'duplicate' && (
              <Alert
                variant="warning"
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
                    A preset named &quot;{duplicatePresetName}&quot; already
                    exists.
                  </span>
                  <span>
                    <Button
                      variant="warning"
                      size="sm"
                      onClick={handleReplacePreset}
                      style={{ marginRight: '8px' }}
                    >
                      Replace
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={dismissError}
                    >
                      Cancel
                    </Button>
                  </span>
                </div>
              </Alert>
            )}
            {uploadStatus === 'error' && (
              <Alert
                variant="danger"
                style={{ marginTop: '10px', marginBottom: 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}
                >
                  <span style={{ whiteSpace: 'pre-wrap' }}>{uploadError}</span>
                  <span
                    onClick={dismissError}
                    style={{ cursor: 'pointer', marginLeft: '10px' }}
                    title="Dismiss"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </span>
                </div>
              </Alert>
            )}
          </Col>
        </Form.Group>
      </Card.Body>
    </Card>
  )
}

export default UnitPreferencesSettings
