import React, { useState } from 'react'
import {
  Button,
  Progress,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ListGroup,
  ListGroupItem
} from 'reactstrap'
import { connect } from 'react-redux'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTrashCan,
  faCloudArrowDown,
  faHistory
} from '@fortawesome/free-solid-svg-icons'

function ActionCellRenderer(props) {
  const app = props.data
  const [showVersionsModal, setShowVersionsModal] = useState(false)
  const [versions, setVersions] = useState([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  const handleInstallClick = () => {
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${props.data.name}/${props.data.version}`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
  }

  const handleInstallVersionClick = (version) => {
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${props.data.name}/${version}`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
    setShowVersionsModal(false)
  }

  const handleVersionsClick = async () => {
    setLoadingVersions(true)
    setShowVersionsModal(true)

    try {
      // Fetch versions from npm registry
      const response = await fetch(
        `https://registry.npmjs.org/${props.data.name}`
      )
      const packageData = await response.json()

      if (packageData.versions) {
        // Get all versions and sort them by semver (newest first)
        const versionList = Object.keys(packageData.versions)
          .filter((version) => version !== props.data.version) // Exclude current version
          .sort((a, b) => {
            // Simple version comparison - newer versions first
            const aParts = a.split('.').map(Number)
            const bParts = b.split('.').map(Number)

            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
              const aPart = aParts[i] || 0
              const bPart = bParts[i] || 0

              if (bPart !== aPart) {
                return bPart - aPart
              }
            }
            return 0
          })
          .slice(0, 20) // Limit to 20 versions

        setVersions(versionList)
      }
    } catch (error) {
      console.error('Failed to fetch versions:', error)
      setVersions([])
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleRemoveClick = () => {
    if (confirm(`Are you sure you want to uninstall ${props.data.name}?`)) {
      fetch(`${window.serverRoutesPrefix}/appstore/remove/${props.data.name}`, {
        method: 'POST',
        credentials: 'include'
      })
    }
  }

  let content
  let status
  let progress

  if (app.installing) {
    // Read the status of the progressing app
    // If the app has progressed we show the status

    if (app.isInstalling || app.isRemoving || app.isWaiting) {
      status = app.isRemove
        ? 'Removing'
        : app.isWaiting
          ? 'Waiting..'
          : 'Installing'
      progress = (
        <Progress
          className="progress-sm progress__bar"
          animated
          color="success"
          value="100"
        />
      )
    } else if (app.installFailed) {
      status = 'Failed'
    } else if (app.isRemove) {
      status = 'Removed'
    } else if (app.installedVersion) {
      status = 'Updated'
    } else {
      status = 'Installed'
    }

    content = (
      <div className="progress__wrapper">
        <p className="progress__status">{status}</p>
        {progress}
      </div>
    )
  } else {
    content = props.data.installed ? (
      <>
        {props.data.newVersion && (
          <FontAwesomeIcon
            className="icon__update"
            icon={faCloudArrowDown}
            onClick={handleInstallClick}
          />
        )}

        {/* TODO: Not implemented yet
         <NavLink to={`/serverConfiguration/plugins/${props.data.name}`}>
          <FontAwesomeIcon className="icon__config" icon={faGear} />
        </NavLink> */}

        <FontAwesomeIcon
          className="icon__remove"
          icon={faTrashCan}
          onClick={handleRemoveClick}
        />

        <FontAwesomeIcon
          className="icon__versions"
          icon={faHistory}
          onClick={handleVersionsClick}
          title="View older versions"
        />
      </>
    ) : (
      <>
        <Button
          className="button__install"
          color="primary"
          onClick={handleInstallClick}
          style={{ marginRight: '8px' }}
        >
          Install
        </Button>

        <FontAwesomeIcon
          className="icon__versions"
          icon={faHistory}
          onClick={handleVersionsClick}
          title="View older versions"
        />
      </>
    )
  }
  return (
    <div className="cell__renderer cell-action center">
      <div>{content}</div>

      {/* Versions Modal */}
      <Modal
        isOpen={showVersionsModal}
        toggle={() => setShowVersionsModal(!showVersionsModal)}
        size="md"
      >
        <ModalHeader toggle={() => setShowVersionsModal(!showVersionsModal)}>
          Older Versions - {props.data.name}
        </ModalHeader>
        <ModalBody>
          {loadingVersions ? (
            <div className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="sr-only">Loading...</span>
              </div>
              <p className="mt-2">Loading versions...</p>
            </div>
          ) : versions.length > 0 ? (
            <ListGroup>
              {versions.map((version) => (
                <ListGroupItem
                  key={version}
                  className="d-flex justify-content-between align-items-center"
                >
                  <span>
                    <strong>{version}</strong>
                    {props.data.installedVersion === version && (
                      <span className="badge badge-success ml-2">
                        Installed
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    color="primary"
                    onClick={() => handleInstallVersionClick(version)}
                    disabled={props.data.installedVersion === version}
                  >
                    {props.data.installedVersion === version
                      ? 'Installed'
                      : 'Install'}
                  </Button>
                </ListGroupItem>
              ))}
            </ListGroup>
          ) : (
            <p className="text-muted">
              No older versions available or failed to load versions.
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowVersionsModal(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}

const mapStateToProps = ({ appStore }) => ({ appStore })

export default connect(mapStateToProps)(ActionCellRenderer)
