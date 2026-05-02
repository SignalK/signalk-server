import { useState, ReactNode } from 'react'
import Button from 'react-bootstrap/Button'
import ButtonGroup from 'react-bootstrap/ButtonGroup'
import Dropdown from 'react-bootstrap/Dropdown'
import ListGroup from 'react-bootstrap/ListGroup'
import Modal from 'react-bootstrap/Modal'
import ProgressBar from 'react-bootstrap/ProgressBar'
import { NavLink } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons/faTrashCan'
import { faCloudArrowDown } from '@fortawesome/free-solid-svg-icons/faCloudArrowDown'
import { faGear } from '@fortawesome/free-solid-svg-icons/faGear'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons/faArrowUpRightFromSquare'
import { faLink } from '@fortawesome/free-solid-svg-icons/faLink'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'
import { urlToWebapp } from '../../../Webapps/Webapp'
import semver from 'semver'

interface PluginDataSize {
  totalBytes: number
  fileCount: number
  hasData: boolean
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

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
  const [allVersions, setAllVersions] = useState<string[]>([])
  const [distTags, setDistTags] = useState<Record<string, string>>({})
  const [loadingVersions, setLoadingVersions] = useState(false)
  const [showAllVersions, setShowAllVersions] = useState(false)
  const [showRemoveModal, setShowRemoveModal] = useState(false)
  const [deleteData, setDeleteData] = useState(false)
  const [dataSize, setDataSize] = useState<PluginDataSize | null>(null)
  const [loadingDataSize, setLoadingDataSize] = useState(false)
  const [removeError, setRemoveError] = useState<string | null>(null)

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
    setShowAllVersions(false)

    try {
      const response = await fetch(`https://registry.npmjs.org/${app.name}`)
      const packageData = await response.json()

      if (packageData.versions) {
        const sorted = semver.rsort(Object.keys(packageData.versions))
        const nonDeprecated = sorted.filter(
          (v) => !packageData.versions[v].deprecated
        )

        // Default view: last 5 stable releases + only pre-releases newer than latest stable
        const filtered: string[] = []
        let stableCount = 0
        for (const v of nonDeprecated) {
          if (semver.prerelease(v)) {
            if (stableCount === 0) {
              filtered.push(v) // only pre-releases above latest stable
            }
          } else {
            if (stableCount < 5) {
              filtered.push(v)
              stableCount++
            }
          }
        }

        setVersions(filtered)
        setAllVersions(nonDeprecated)
      }
      if (packageData['dist-tags']) {
        setDistTags(packageData['dist-tags'])
      }
    } catch (error) {
      console.error('Failed to fetch versions:', error)
      setVersions([])
      setAllVersions([])
    } finally {
      setLoadingVersions(false)
    }
  }

  const handleRemoveClick = async () => {
    setDeleteData(false)
    setRemoveError(null)
    setShowRemoveModal(true)
    setLoadingDataSize(true)
    setDataSize(null)

    try {
      const response = await fetch(
        `${window.serverRoutesPrefix}/appstore/datasize/${app.name}`,
        { credentials: 'include' }
      )
      if (response.ok) {
        setDataSize(await response.json())
      }
    } catch (error) {
      console.error('Failed to fetch data size:', error)
    } finally {
      setLoadingDataSize(false)
    }
  }

  const handleConfirmRemove = async () => {
    setRemoveError(null)
    try {
      const response = await fetch(
        `${window.serverRoutesPrefix}/appstore/remove/${app.name}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deleteData })
        }
      )
      if (!response.ok) {
        setRemoveError(
          `Failed to remove ${app.name}: server returned ${response.status}`
        )
        return
      }
      setShowRemoveModal(false)
    } catch (error) {
      setRemoveError(
        `Failed to remove ${app.name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  let content: ReactNode
  let status: string | undefined
  let progress: ReactNode | undefined

  if (app.installing) {
    if (app.isInstalling || app.isRemoving || app.isWaiting) {
      status = app.isRemove
        ? 'Removing'
        : app.isWaiting
          ? 'Waiting..'
          : 'Installing'
      progress = (
        <ProgressBar
          className="progress-sm progress__bar"
          animated
          variant="success"
          now={100}
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
        <Dropdown as={ButtonGroup} className="w-100">
          {app.installed ? (
            app.newVersion ? (
              app.updateDisabled ? (
                <span className="btn btn-outline-secondary text-start disabled">
                  Update disabled
                </span>
              ) : (
                <Button
                  className="text-start"
                  variant="success"
                  onClick={handleInstallClick}
                >
                  <FontAwesomeIcon
                    className="icon__update me-2"
                    icon={faCloudArrowDown}
                  />
                  Update
                </Button>
              )
            ) : app.isPlugin ? (
              <NavLink
                to={`/apps/configuration/${app.id}`}
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
              variant="light"
              onClick={handleInstallClick}
            >
              <FontAwesomeIcon className="me-2" icon={faCloudArrowDown} />
              Install
            </Button>
          )}

          <Dropdown.Toggle
            split
            variant={app.newVersion ? 'success' : 'light'}
            className="flex-grow-0"
          />
          <Dropdown.Menu align="end">
            {app.installed && app.newVersion && (
              <NavLink
                to={`/apps/configuration/${app.id}`}
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

            <Dropdown.Item onClick={handleVersionsClick} className="text-start">
              <FontAwesomeIcon className="me-2" icon={faCloudArrowDown} />
              Versions
            </Dropdown.Item>

            {app.installed && (
              <Dropdown.Item
                onClick={handleRemoveClick}
                className="text-danger"
              >
                <FontAwesomeIcon className="me-2" icon={faTrashCan} />
                Remove
              </Dropdown.Item>
            )}
          </Dropdown.Menu>
        </Dropdown>
      </>
    )
  }
  return (
    <div className="cell__renderer cell-action">
      <div>{content}</div>
      {/* Versions Modal */}
      <Modal
        show={showVersionsModal}
        onHide={() => setShowVersionsModal(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Versions - {app.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingVersions ? (
            <div className="text-center">
              <div className="spinner-border text-primary" role="status">
                <span className="sr-only">Loading...</span>
              </div>
              <p className="mt-2">Loading versions...</p>
            </div>
          ) : versions.length > 0 ? (
            <>
              <div
                style={{
                  maxHeight: '450px',
                  overflowY: 'auto',
                  border: '1px solid #ccc'
                }}
              >
                <ListGroup>
                  {(showAllVersions ? allVersions : versions).map((version) => {
                    const isPrerelease = !!semver.prerelease(version)

                    return (
                      <ListGroup.Item
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
                          {distTags.latest === version && (
                            <span className="badge text-bg-primary ms-2">
                              latest
                            </span>
                          )}
                          {isPrerelease && (
                            <span className="badge text-bg-warning ms-2">
                              pre-release
                            </span>
                          )}
                        </span>
                        {app.installedVersion !== version && (
                          <Button
                            size="sm"
                            variant="light"
                            onClick={() => handleInstallVersionClick(version)}
                          >
                            <FontAwesomeIcon
                              className="icon__update me-2"
                              icon={faCloudArrowDown}
                            />
                            Install
                          </Button>
                        )}
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              </div>
              {allVersions.length > versions.length && (
                <div className="text-center mt-2">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setShowAllVersions(!showAllVersions)}
                  >
                    {showAllVersions
                      ? 'Show recent versions'
                      : `Show all ${allVersions.length} versions`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted">
              No older versions available or failed to load versions.
            </p>
          )}
        </Modal.Body>
      </Modal>
      <Modal show={showRemoveModal} onHide={() => setShowRemoveModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Remove {app.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to remove <strong>{app.name}</strong>?
          </p>
          {loadingDataSize ? (
            <div className="text-center">
              <div
                className="spinner-border spinner-border-sm text-primary"
                role="status"
              >
                <span className="visually-hidden">Loading...</span>
              </div>
              <span className="ms-2">Checking plugin data...</span>
            </div>
          ) : dataSize && dataSize.hasData ? (
            <div className="mt-3">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`deleteDataCheck-${app.name}`}
                  checked={deleteData}
                  onChange={(e) => setDeleteData(e.target.checked)}
                />
                <label
                  className="form-check-label"
                  htmlFor={`deleteDataCheck-${app.name}`}
                >
                  Also delete plugin configuration and data (
                  {formatBytes(dataSize.totalBytes)})
                </label>
              </div>
              {deleteData && (
                <div className="alert alert-danger mt-2 py-2" role="alert">
                  <FontAwesomeIcon
                    icon={faTriangleExclamation}
                    className="me-2"
                  />
                  <small>
                    Plugin configuration and data files ({dataSize.fileCount}{' '}
                    {dataSize.fileCount === 1 ? 'file' : 'files'}) will be
                    permanently deleted.
                  </small>
                </div>
              )}
            </div>
          ) : dataSize && !dataSize.hasData ? (
            <p className="text-muted mb-0">
              <small>No plugin data found on disk.</small>
            </p>
          ) : null}
          {removeError && (
            <div className="alert alert-danger mt-3 py-2 mb-0" role="alert">
              <small>{removeError}</small>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRemoveModal(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirmRemove}
            disabled={loadingDataSize}
          >
            <FontAwesomeIcon className="me-2" icon={faTrashCan} />
            Remove
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
