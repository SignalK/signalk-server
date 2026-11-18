import Button from 'react-bootstrap/Button'
import Modal from 'react-bootstrap/Modal'
import { useRestartDialog, useStore } from '../../store'
import { requestRestart } from '../../actions'

export default function RestartDialog() {
  const dialog = useRestartDialog()

  const close = () => useStore.getState().setRestartDialog(null)
  const restart = (keepData: boolean) => {
    close()
    requestRestart(keepData)
  }

  return (
    <Modal show={dialog !== null} onHide={close} centered>
      <Modal.Header closeButton>
        <Modal.Title>Restart server</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {dialog?.keepsData
          ? 'The latest values are kept over the restart. Restart with no data to start with a clean slate.'
          : 'Are you sure you want to restart?'}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        {dialog?.keepsData && (
          <Button variant="outline-danger" onClick={() => restart(false)}>
            Restart with no data
          </Button>
        )}
        <Button variant="primary" onClick={() => restart(true)}>
          {dialog?.keepsData ? 'Restart, keep data' : 'Restart'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
