import React, { useState, useEffect, useCallback } from 'react'
import Badge from 'react-bootstrap/Badge'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBluetooth } from '@fortawesome/free-brands-svg-icons/faBluetooth'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'

const BLE_API = '/signalk/v2/api/vessels/self/ble'

interface BLESettingsData {
  localBluetoothManaged: boolean
  localMaxGATTSlots: number
  localBLESupported: boolean
}

const BLESettings: React.FC = () => {
  const [settings, setSettings] = useState<BLESettingsData | null>(null)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${BLE_API}/settings`, { credentials: 'include' })
      if (res.ok) setSettings(await res.json())
    } catch (_e) {
      // ignore — BLE API may not be available
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = useCallback(async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch(`${BLE_API}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localBluetoothManaged: settings.localBluetoothManaged,
          localMaxGATTSlots: settings.localMaxGATTSlots
        }),
        credentials: 'include'
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }))
        alert(err.message || 'Failed to save BLE settings')
      }
    } finally {
      setSaving(false)
    }
  }, [settings])

  if (!settings) return null

  const supported = settings.localBLESupported

  return (
    <Card className="mt-3">
      <Card.Header>
        <FontAwesomeIcon icon={faBluetooth} /> <strong>Bluetooth</strong>
      </Card.Header>
      <Card.Body>
        <Form className="form-horizontal">
          <Form.Group as={Row}>
            <Col md="2">
              <Form.Label htmlFor="localBluetoothManaged">
                Local Bluetooth Adapter
              </Form.Label>
            </Col>
            <Col xs="12" md={10}>
              <div className="d-flex align-items-center">
                <Form.Label
                  style={{ marginRight: '15px', marginBottom: 0 }}
                  className="switch switch-text switch-primary"
                >
                  <input
                    type="checkbox"
                    id="localBluetoothManaged"
                    name="localBluetoothManaged"
                    className="switch-input"
                    disabled={!supported}
                    checked={settings.localBluetoothManaged}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, localBluetoothManaged: e.target.checked }
                          : prev
                      )
                    }
                  />
                  <span className="switch-label" data-on="On" data-off="Off" />
                  <span className="switch-handle" />
                </Form.Label>
              </div>
              <Form.Text muted>
                {supported
                  ? "Use the server's built-in Bluetooth adapter for BLE scanning and GATT connections."
                  : 'Local Bluetooth adapter management requires Linux. ESP32 gateways work on all platforms.'}
              </Form.Text>
            </Col>
          </Form.Group>
          {supported && (
            <Form.Group as={Row} className="mt-2">
              <Col md="2">
                <Form.Label htmlFor="localMaxGATTSlots">
                  Max GATT Connections
                </Form.Label>
              </Col>
              <Col xs="12" md={10}>
                <Form.Control
                  style={{ width: 'auto' }}
                  type="number"
                  id="localMaxGATTSlots"
                  name="localMaxGATTSlots"
                  min={1}
                  max={10}
                  value={settings.localMaxGATTSlots}
                  onChange={(e) =>
                    setSettings((prev) => {
                      if (!prev) return prev
                      const val = parseInt(e.target.value) || 3
                      return {
                        ...prev,
                        localMaxGATTSlots: Math.max(1, Math.min(10, val))
                      }
                    })
                  }
                />
                <Form.Text muted>
                  Maximum concurrent GATT connections per local adapter.
                </Form.Text>
              </Col>
            </Form.Group>
          )}
        </Form>
      </Card.Body>
      <Card.Footer>
        <Button
          size="sm"
          variant="primary"
          onClick={handleSave}
          disabled={saving || !supported}
        >
          <FontAwesomeIcon icon={faFloppyDisk} /> Save
        </Button>
        {supported && (
          <>
            {' '}
            <Badge bg="danger" className="float-end">
              Restart Required
            </Badge>
          </>
        )}
      </Card.Footer>
    </Card>
  )
}

export default BLESettings
