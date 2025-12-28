import React from 'react'
import { Button, Alert, ListGroup, ListGroupItem } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheckCircle,
  faExclamationTriangle,
  faRotateRight,
  faCog
} from '@fortawesome/free-solid-svg-icons'

export default function WizardComplete({ bundles, status, onRestart }) {
  const hasErrors = status?.errors?.length > 0
  const installedCount = status?.installed?.length || 0
  const bundleNames =
    bundles?.map((b) => b.name).join(', ') || 'selected bundles'

  return (
    <div className="wizard-complete text-center py-4">
      {hasErrors ? (
        <>
          <FontAwesomeIcon
            icon={faExclamationTriangle}
            size="4x"
            className="text-warning mb-3"
          />
          <h3>Installation Completed with Warnings</h3>
          <p className="text-muted">
            Some packages could not be installed. You can try installing them
            manually from the App Store after restart.
          </p>
        </>
      ) : (
        <>
          <FontAwesomeIcon
            icon={faCheckCircle}
            size="4x"
            className="text-success mb-3"
          />
          <h3>Installation Complete!</h3>
          <p className="text-muted">
            {bundleNames} {bundles?.length > 1 ? 'have' : 'has'} been
            successfully installed.
          </p>
        </>
      )}

      {installedCount > 0 && (
        <div className="my-4">
          <h6>Installed packages:</h6>
          <ListGroup
            className="text-left"
            style={{ maxWidth: '400px', margin: '0 auto' }}
          >
            {status.installed.map((item) => (
              <ListGroupItem key={item} className="py-2">
                <code>{item}</code>
              </ListGroupItem>
            ))}
          </ListGroup>
        </div>
      )}

      {hasErrors && (
        <Alert
          color="warning"
          className="text-left my-4"
          style={{ maxWidth: '500px', margin: '0 auto' }}
        >
          <h6>Failed to install:</h6>
          <ul className="mb-0">
            {status.errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Alert
        color="info"
        className="my-4 text-left"
        style={{ maxWidth: '500px', margin: '0 auto' }}
      >
        <h6 className="mb-3">
          <FontAwesomeIcon icon={faRotateRight} className="mr-2" />
          Next Steps
        </h6>
        <ol className="mb-0 pl-3">
          <li className="mb-2">
            <strong>Restart the server</strong> to activate the newly installed
            plugins and webapps.
          </li>
          <li>
            After restart, go to <strong>Server → Plugin Config</strong> to
            configure your plugins.
            <br />
            <small className="text-muted">
              <FontAwesomeIcon icon={faCog} className="mr-1" />
              Each plugin needs to be enabled and configured for your setup.
            </small>
          </li>
        </ol>
      </Alert>

      <div className="d-flex justify-content-center mt-4">
        <Button color="primary" size="lg" onClick={onRestart}>
          <FontAwesomeIcon icon={faRotateRight} className="mr-2" />
          Restart Server Now
        </Button>
      </div>
    </div>
  )
}
