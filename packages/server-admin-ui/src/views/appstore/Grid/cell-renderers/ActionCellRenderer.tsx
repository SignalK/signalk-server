import { useState, ReactNode } from 'react'
import {
  Button,
  Progress,
  Modal,
  ModalHeader,
  ModalBody,
  ListGroup,
  ListGroupItem,
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem
} from 'reactstrap'
import { NavLink } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan'
import { faCloudArrowDown } from '@fortawesome/free-solid-svg-icons/faCloudArrowDown'
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons/faArrowUpRightFromSquare'
import { faLink } from '@fortawesome/free-solid-svg-icons/faLink'
import { urlToWebapp } from '../../../Webapps/Webapp'
import semver from 'semver'

interface AppData {
  name: string
  version?: string
  installedVersion?: string
  newVersion?: string
  installed?: boolean
  installing?: boolean
  isInstalling?: boolean
  isRemoving?: boolean
  isWaiting?: boolean
  isRemove?: boolean
  installFailed?: boolean
  isPlugin?: boolean
  id?: string
  npmUrl?: string
  [key: string]: unknown
}

interface ActionCellRendererProps {
  data: AppData
}

export default function ActionCellRenderer({
  data: app
}: ActionCellRendererProps) {
  const [showVersionsModal, setShowVersionsModal] = useState(false)
  const [versions, setVersions] = useState<string[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  const handleInstallClick = () => {
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${app.name}/${app.version}`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
  }

  const handleInstallVersionClick = (version: string) => {
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${app.name}/${version}`,
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
      const response = await fetch(`https://registry.npmjs.org/${app.name}`)
      const packageData = await response.json()

      if (packageData.versions) {
        // Get all versions and sort them by semver (newest first)
        const versionList = semver.rsort(Object.keys(packageData.versions))
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
    if (confirm(`Are you sure you want to uninstall ${app.name}?`)) {
      fetch(`${window.serverRoutesPrefix}/appstore/remove/${app.name}`, {
        method: 'POST',
        credentials: 'include'
      })
    }
  }

  let content: ReactNode
  let status: string | undefined
  let progress: ReactNode | undefined

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
        <div className="progress__status p-1">{status}</div>
        {progress}
      </div>
    )
  } else {
    content = (
      <>
        <UncontrolledDropdown group className="w-100">
          {app.installed ? (
            app.newVersion ? (
              <Button
                className="text-start"
                color="success"
                onClick={handleInstallClick}
              >
                <FontAwesomeIcon
                  className="icon__update me-2"
                  icon={faCloudArrowDown}
                />
                Update
              </Button>
            ) : app.isPlugin ? (
              <NavLink
                to={`/serverConfiguration/plugins/${app.id}`}
                role="button"
                className="btn btn-light text-start"
              >
                <FontAwesomeIcon className="me-2" icon={faGear} />
                Configure
              </NavLink>
            ) : (
              <a
                href={urlToWebapp(app)}
                role="button"
                className="btn btn-light text-start"
              >
                <FontAwesomeIcon className="me-2" icon={faLink} />
                Open
              </a>
            )
          ) : (
            <Button
              className="text-start"
              color="light"
              onClick={handleInstallClick}
            >
              <FontAwesomeIcon className="me-2" icon={faCloudArrowDown} />
              Install
            </Button>
          )}

          <DropdownToggle
            caret
            color={app.newVersion ? 'success' : 'light'}
            className="flex-grow-0"
          />
          <DropdownMenu end>
            {app.installed && app.newVersion && (
              <NavLink
                to={`/serverConfiguration/plugins/${app.id}`}
                className="dropdown-item"
              >
                <FontAwesomeIcon className="me-2" icon={faGear} /> Configure
              </NavLink>
            )}
            {app.npmUrl && (
              <a
                href={app.npmUrl}
                target="_blank"
                rel="noreferrer"
                className="dropdown-item"
              >
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="me-2"
                />
                View on NPM
              </a>
            )}

            <DropdownItem onClick={handleVersionsClick} className="text-start">
              <FontAwesomeIcon className="me-2" icon={faCloudArrowDown} />
              Versions
            </DropdownItem>

            {app.installed && (
              <DropdownItem onClick={handleRemoveClick} className="text-danger">
                <FontAwesomeIcon className="me-2" icon={faTrashCan} />
                Remove
              </DropdownItem>
            )}
          </DropdownMenu>
        </UncontrolledDropdown>
      </>
    )
  }
  return (
    <div className="cell__renderer cell-action">
      <div>{content}</div>
      {/* Versions Modal */}
      <Modal
        isOpen={showVersionsModal}
        toggle={() => setShowVersionsModal(!showVersionsModal)}
        size="md"
      >
        <ModalHeader toggle={() => setShowVersionsModal(!showVersionsModal)}>
          Versions - {app.name}
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
            <div
              style={{
                maxHeight: '450px',
                overflowY: 'auto',
                border: '1px solid #ccc'
              }}
            >
              <ListGroup>
                {versions.map((version) => (
                  <ListGroupItem
                    key={version}
                    className="d-flex justify-content-between align-items-center"
                  >
                    <span>
                      <strong>{version}</strong>
                      {app.installedVersion === version && (
                        <span className="badge text-bg-success ms-2">
                          Installed
                        </span>
                      )}
                    </span>
                    {app.installedVersion !== version && (
                      <Button
                        size="sm"
                        color="light"
                        onClick={() => handleInstallVersionClick(version)}
                      >
                        <FontAwesomeIcon
                          className="icon__update me-2"
                          icon={faCloudArrowDown}
                        />
                        Install
                      </Button>
                    )}
                  </ListGroupItem>
                ))}
              </ListGroup>
            </div>
          ) : (
            <p className="text-muted">
              No older versions available or failed to load versions.
            </p>
          )}
        </ModalBody>
      </Modal>
    </div>
  )
}
