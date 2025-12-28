import React from 'react'
import { Button, Alert, ListGroup, ListGroupItem } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheckCircle, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons'
import { Link } from 'react-router-dom'

export default function WizardComplete({ bundle, status, onRestart }) {
  const hasErrors = status?.errors?.length > 0
  const installedCount = status?.installed?.length || 0

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
            manually from the App Store.
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
            The <strong>{bundle?.name}</strong> bundle has been successfully installed.
          </p>
        </>
      )}

      {installedCount > 0 && (
        <div className="my-4">
          <h6>Installed packages:</h6>
          <ListGroup className="text-left" style={{ maxWidth: '400px', margin: '0 auto' }}>
            {status.installed.map((item) => (
              <ListGroupItem key={item} className="py-2">
                <code>{item}</code>
              </ListGroupItem>
            ))}
          </ListGroup>
        </div>
      )}

      {hasErrors && (
        <Alert color="warning" className="text-left my-4" style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h6>Failed to install:</h6>
          <ul className="mb-0">
            {status.errors.map((error, idx) => (
              <li key={idx}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}

      <Alert color="info" className="my-4" style={{ maxWidth: '500px', margin: '0 auto' }}>
        <strong>Important:</strong> Please restart the server to activate the
        newly installed plugins and webapps.
      </Alert>

      <div className="d-flex justify-content-center gap-3 mt-4">
        <Button color="primary" size="lg" onClick={onRestart}>
          Restart Server Now
        </Button>
        <Link to="/appstore">
          <Button color="secondary" size="lg">
            Go to App Store
          </Button>
        </Link>
      </div>

      <p className="text-muted mt-4 small">
        After restarting, you may need to configure individual plugins from the
        Server Configuration menu.
      </p>
    </div>
  )
}
