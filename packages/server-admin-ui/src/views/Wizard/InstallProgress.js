import React from 'react'
import { Progress, ListGroup, ListGroupItem, Spinner } from 'reactstrap'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheck,
  faTimes,
  faSpinner
} from '@fortawesome/free-solid-svg-icons'

export default function InstallProgress({ status }) {
  if (!status) {
    return (
      <div className="text-center py-5">
        <Spinner color="primary" />
        <p className="mt-3 text-muted">Preparing installation...</p>
      </div>
    )
  }

  const progress =
    status.totalSteps > 0
      ? Math.round((status.currentStep / status.totalSteps) * 100)
      : 0

  return (
    <div className="install-progress">
      <h4 className="mb-4">Installing Bundle</h4>

      <div className="mb-4">
        <div className="d-flex justify-content-between mb-1">
          <span>Progress</span>
          <span>
            {status.currentStep} of {status.totalSteps}
          </span>
        </div>
        <Progress value={progress} animated={status.state === 'installing'}>
          {progress}%
        </Progress>
      </div>

      {status.currentItem && status.state === 'installing' && (
        <div className="mb-4 text-center">
          <Spinner size="sm" color="primary" className="mr-2" />
          <span className="text-muted">
            Installing <code>{status.currentItem}</code>...
          </span>
        </div>
      )}

      {(status.installed.length > 0 || status.errors.length > 0) && (
        <ListGroup className="mb-4">
          {status.installed.map((item) => (
            <ListGroupItem
              key={item}
              className="d-flex justify-content-between align-items-center"
            >
              <code>{item}</code>
              <FontAwesomeIcon icon={faCheck} className="text-success" />
            </ListGroupItem>
          ))}
          {status.errors.map((error, idx) => (
            <ListGroupItem
              key={idx}
              className="d-flex justify-content-between align-items-center list-group-item-danger"
            >
              <span>{error}</span>
              <FontAwesomeIcon icon={faTimes} className="text-danger" />
            </ListGroupItem>
          ))}
        </ListGroup>
      )}

      {status.state === 'installing' && (
        <p className="text-muted text-center small">
          Please wait while the packages are being installed. This may take a few minutes.
        </p>
      )}
    </div>
  )
}
