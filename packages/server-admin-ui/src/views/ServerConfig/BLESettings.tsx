import React, { useEffect } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Card from 'react-bootstrap/Card'
import Col from 'react-bootstrap/Col'
import Form from 'react-bootstrap/Form'
import Row from 'react-bootstrap/Row'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBluetooth } from '@fortawesome/free-brands-svg-icons/faBluetooth'
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons/faFloppyDisk'
import { useStore, useShallow } from '../../store'

const MIN_GATT_SLOTS = 1
const MAX_GATT_SLOTS = 10

const BLESettings: React.FC = () => {
  const { settings, saving, saveError } = useStore(
    useShallow((s) => ({
      settings: s.bleSettings,
      saving: s.bleSettingsSaving,
      saveError: s.bleSettingsSaveError
    }))
  )

  useEffect(() => {
    useStore.getState().fetchBleSettings()
  }, [])

  if (!settings) return null

  const supported = settings.localBLESupported
  const { setBleSettingsLocal, saveBleSettings, clearBleSettingsSaveError } =
    useStore.getState()

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
                      setBleSettingsLocal({
                        localBluetoothManaged: e.target.checked
                      })
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
                  min={MIN_GATT_SLOTS}
                  max={MAX_GATT_SLOTS}
                  value={settings.localMaxGATTSlots}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (isNaN(val)) return
                    setBleSettingsLocal({
                      localMaxGATTSlots: Math.max(
                        MIN_GATT_SLOTS,
                        Math.min(MAX_GATT_SLOTS, val)
                      )
                    })
                  }}
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
        {saveError && (
          <Alert
            variant="danger"
            dismissible
            onClose={clearBleSettingsSaveError}
          >
            {saveError}
          </Alert>
        )}
        <Button
          size="sm"
          variant="primary"
          onClick={() => saveBleSettings()}
          disabled={saving || !supported}
        >
          <FontAwesomeIcon icon={faFloppyDisk} /> Save
        </Button>
      </Card.Footer>
    </Card>
  )
}

export default BLESettings
