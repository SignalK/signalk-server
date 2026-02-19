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
  usePresets,
  useStore
} from '../../store'

type UploadStatus = 'uploading' | 'success' | 'duplicate' | 'error' | null

const PILL_COLORS = [
  '#28a745',
  '#007bff',
  '#6f42c1',
  '#fd7e14',
  '#20c997',
  '#e83e8c'
]

const UnitPreferencesSettings: React.FC = () => {
  const loginStatus = useLoginStatus()
  const activePreset = useActivePreset()
  const presets = usePresets()
  const unitPrefsLoaded = useStore((s) => s.unitPrefsLoaded)
  const fetchUnitPreferences = useStore((s) => s.fetchUnitPreferences)
  const setActivePresetAndSave = useStore((s) => s.setActivePresetAndSave)
  const setPresets = useStore((s) => s.setPresets)

  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [duplicatePresetName, setDuplicatePresetName] = useState<string | null>(
    null
  )
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!unitPrefsLoaded) {
      fetchUnitPreferences()
    }
  }, [unitPrefsLoaded, fetchUnitPreferences])

  const isAdmin =
    !loginStatus.authenticationRequired ||
    (loginStatus.status === 'loggedIn' &&
      (loginStatus as Record<string, unknown>).userLevel === 'admin')

  const handlePresetChange = useCallback(
    async (preset: string) => {
      await setActivePresetAndSave(preset)
    },
    [setActivePresetAndSave]
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

  return (
    <Card>
      <Card.Header>
        <FontAwesomeIcon icon={faSliders} /> <strong>Unit Preferences</strong>
      </Card.Header>
      <Card.Body>
        <Form.Group as={Row}>
          <Col md={2}>Display Units</Col>
          <Col
            md={10}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap'
            }}
          >
            {presets.map((preset, index) => {
              const isActive = activePreset === preset.name
              const baseColor = preset.isCustom
                ? '#6c757d'
                : PILL_COLORS[index % PILL_COLORS.length]
              return (
                <span
                  key={preset.name}
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
                  title={preset.isCustom ? 'Custom preset' : 'Built-in preset'}
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
                        color: 'white'
                      }}
                    >
                      custom
                    </span>
                  )}
                  <span
                    onClick={() => handlePresetChange(preset.name)}
                    style={{ cursor: 'pointer' }}
                  >
                    {preset.label}
                  </span>
                  {preset.isCustom && isAdmin && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletePreset(preset.name)
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
        </Form.Group>

        {isAdmin && (
          <Form.Group as={Row}>
            <Col md={2}>Upload Preset</Col>
            <Col md={10}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                id="preset-upload"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadStatus === 'uploading'}
              >
                <FontAwesomeIcon icon={faUpload} />{' '}
                {uploadStatus === 'uploading'
                  ? 'Uploading...'
                  : 'Upload Custom Preset'}
              </Button>
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
                    <span style={{ whiteSpace: 'pre-wrap' }}>
                      {uploadError}
                    </span>
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
        )}
      </Card.Body>
    </Card>
  )
}

export default UnitPreferencesSettings
