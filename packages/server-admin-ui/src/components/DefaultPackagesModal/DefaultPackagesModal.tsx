import { useState } from 'react'
import Alert from 'react-bootstrap/Alert'
import Button from 'react-bootstrap/Button'
import Form from 'react-bootstrap/Form'
import Modal from 'react-bootstrap/Modal'
import Spinner from 'react-bootstrap/Spinner'
import { requestRestart } from '../../actions'
import {
  useDefaultPackages,
  useInstalledPackagesNeedingRestart,
  useLoginStatus,
  useRestarting,
  useStore
} from '../../store'
import type { DefaultPackagesState } from '../../store/slices/appSlice'
import { mayConfigureServer, mayRestartServer } from '../../utils/permissions'

const errorMessage = (prefix: string, err: unknown) =>
  `${prefix}: ${err instanceof Error ? err.message : String(err)}`

function restartKey(packages: string[]): string {
  return JSON.stringify([...packages].sort())
}

function statusKey(state: DefaultPackagesState): string {
  return JSON.stringify([
    state.status,
    Object.entries(state.packages).sort(([a], [b]) => a.localeCompare(b))
  ])
}

function RestartModal({
  packages,
  onRestarted,
  onClose
}: {
  packages: string[]
  onRestarted: () => void
  onClose: () => void
}) {
  const loginStatus = useLoginStatus()
  const [error, setError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const canRestart = mayRestartServer(loginStatus)

  const restart = () => {
    setRestarting(true)
    requestRestart()
      .then(onRestarted)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setRestarting(false)
      })
  }

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Restart required</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>These apps and plugins were installed:</p>
        <ul>
          {packages.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
        <p>Restart the server to start using them.</p>
        {!canRestart && (
          <p>
            {loginStatus.authenticationRequired === false
              ? 'Restart the Signal K service on the computer it runs on.'
              : 'Log in as an administrator to restart the server here, or restart the Signal K service on the computer it runs on.'}
          </p>
        )}
        {error && (
          <Alert variant="danger" role="alert">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Later
        </Button>
        {canRestart && (
          <Button variant="primary" onClick={restart} disabled={restarting}>
            Restart now
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}

interface StatusModalProps {
  packages: Record<string, string>
  failed?: Record<string, string>
  onClose: () => void
}

function OfferModal({ packages, failed, onClose }: StatusModalProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggle = (name: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const submit = (install: string[]) => {
    setSaving(true)
    setError(null)
    fetch(`${window.serverRoutesPrefix}/appstore/defaultPackages`, {
      credentials: 'include',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ install })
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(String(res.status))
        }
        onClose()
      })
      .catch((err: unknown) => {
        setError(errorMessage('Saving the choice failed', err))
        setSaving(false)
      })
  }

  // Closing while the choice is saved would hide an error saving it.
  const hide = saving ? () => {} : onClose

  return (
    <Modal show onHide={hide}>
      <Modal.Header closeButton={!saving}>
        <Modal.Title>Apps no longer included with the server</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {failed && (
          <Alert variant="warning" role="alert">
            Installing {Object.keys(failed).join(', ')} failed. The server tries
            again each time it starts.
          </Alert>
        )}
        <Form.Group as="fieldset">
          <Form.Label as="legend" className="fs-6">
            These apps and plugins are no longer installed with the server. Pick
            the ones you want to install. The ones you leave out are not offered
            again, and you can install them later from the Appstore.
          </Form.Label>
          {Object.keys(packages).map((name) => (
            <Form.Check
              key={name}
              id={`default-package-${name}`}
              type="checkbox"
              label={name}
              checked={selected.has(name)}
              disabled={saving}
              onChange={() => toggle(name)}
            />
          ))}
        </Form.Group>
        {error && (
          <Alert variant="danger" role="alert" className="mt-3">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" onClick={onClose} disabled={saving}>
          Ask me later
        </Button>
        <Button
          variant="secondary"
          onClick={() => submit([])}
          disabled={saving}
        >
          Install none
        </Button>
        <Button
          variant="primary"
          disabled={saving || selected.size === 0}
          onClick={() => submit(Array.from(selected))}
        >
          Install selected
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function InstallingModal({ packages, onClose }: StatusModalProps) {
  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Installing apps</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          <Spinner animation="border" size="sm" className="me-2" />
          Installing {Object.keys(packages).join(', ')}.
        </p>
        <p>
          The server keeps running meanwhile, and the Appstore shows the
          progress. You are asked to restart once they are installed.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

function FailedModal({ packages, onClose }: StatusModalProps) {
  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Installing apps failed</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Installing {Object.keys(packages).join(', ')} failed. The server log
          has the details.
        </p>
        <p>
          The server tries again each time it starts, so check that it can reach
          the internet. You can also install them from the Appstore.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

const STATUS_MODALS: Partial<
  Record<DefaultPackagesState['status'], typeof FailedModal>
> = {
  offer: OfferModal,
  installing: InstallingModal,
  failed: FailedModal
}

export default function DefaultPackagesModal() {
  const defaultPackages = useDefaultPackages()
  const needingRestart = useInstalledPackagesNeedingRestart()
  const loginStatus = useLoginStatus()
  const restarting = useRestarting()
  const [dismissedRestart, setDismissedRestart] = useState<string | null>(null)
  const [dismissedStatus, setDismissedStatus] = useState<string | null>(null)

  if (needingRestart.length === 0 && dismissedRestart !== null) {
    setDismissedRestart(null)
  }
  if (defaultPackages === null && dismissedStatus !== null) {
    setDismissedStatus(null)
  }
  // The server that comes back sends its own status.
  if (restarting) {
    return null
  }

  const currentRestartKey = restartKey(needingRestart)
  if (needingRestart.length > 0 && dismissedRestart !== currentRestartKey) {
    return (
      <RestartModal
        packages={needingRestart}
        onRestarted={() => setDismissedRestart(currentRestartKey)}
        onClose={() => {
          setDismissedRestart(currentRestartKey)
          useStore.getState().setRestartRequired(true)
        }}
      />
    )
  }
  if (!defaultPackages || !mayConfigureServer(loginStatus)) {
    return null
  }
  const currentStatusKey = statusKey(defaultPackages)
  if (dismissedStatus === currentStatusKey) {
    return null
  }
  const StatusModal = STATUS_MODALS[defaultPackages.status]
  if (!StatusModal) {
    return null
  }
  return (
    <StatusModal
      packages={defaultPackages.packages}
      failed={defaultPackages.failed}
      onClose={() => setDismissedStatus(currentStatusKey)}
    />
  )
}
