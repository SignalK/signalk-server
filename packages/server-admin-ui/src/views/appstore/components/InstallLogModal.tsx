import { useEffect, useState } from 'react'
import Button from 'react-bootstrap/Button'
import Modal from 'react-bootstrap/Modal'
import { copyToClipboard } from '../../../utils/clipboard'

interface InstallLog {
  name: string
  version?: string
  isRemove?: boolean
  code?: number
  log: string
}

interface InstallLogModalProps {
  appName: string
  show: boolean
  onClose: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: InstallLog }

export function downloadAsFile(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function logFilename(appName: string): string {
  return `npm-${appName.replace(/[@/]/g, '_')}.log`
}

export default function InstallLogModal({
  appName,
  show,
  onClose
}: InstallLogModalProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  useEffect(() => {
    if (!show) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    setCopyFeedback(null)
    fetch(`${window.serverRoutesPrefix}/appstore/installLog/${appName}`, {
      credentials: 'include',
      signal: controller.signal
    })
      .then(async (res) => {
        if (res.ok) {
          setState({ status: 'loaded', data: (await res.json()) as InstallLog })
        } else if (res.status === 404) {
          setState({
            status: 'error',
            message:
              'No log available. Logs are kept in memory and are lost when the server restarts.'
          })
        } else {
          setState({
            status: 'error',
            message: `Failed to load the log (${res.status}).`
          })
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setState({
          status: 'error',
          message: `Failed to load the log: ${err instanceof Error ? err.message : String(err)}`
        })
      })
    return () => controller.abort()
  }, [show, appName])

  const log = state.status === 'loaded' ? state.data.log : ''

  const handleCopy = () => {
    copyToClipboard(log)
      .then(() => setCopyFeedback('Copied!'))
      .catch(() =>
        setCopyFeedback('Copy failed — select the text and copy manually')
      )
  }

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {state.status === 'loaded' && state.data.isRemove
            ? 'Remove log'
            : 'Install log'}
          : {appName}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {state.status === 'loading' && <p className="mb-0">Loading log...</p>}
        {state.status === 'error' && (
          <p className="mb-0 text-danger">{state.message}</p>
        )}
        {state.status === 'loaded' && (
          <>
            {typeof state.data.code === 'number' && state.data.code !== 0 && (
              <p className="text-danger">
                npm exited with code {state.data.code}
              </p>
            )}
            <pre
              className="bg-light border rounded p-2 small"
              style={{
                maxHeight: '50vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                userSelect: 'text'
              }}
            >
              {log || 'No output was captured.'}
            </pre>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {copyFeedback && (
          <span className="me-auto small text-muted">{copyFeedback}</span>
        )}
        <Button
          variant="primary"
          disabled={state.status !== 'loaded' || log.length === 0}
          onClick={handleCopy}
        >
          Copy log
        </Button>
        <Button
          variant="outline-primary"
          disabled={state.status !== 'loaded' || log.length === 0}
          onClick={() => downloadAsFile(logFilename(appName), log)}
        >
          Download
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
