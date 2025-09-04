import React from 'react'
import { Button, Progress } from 'reactstrap'
import { connect } from 'react-redux'
import { NavLink } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faTrashCan,
  faCloudArrowDown,
  faGear,
  faArrowUpRightFromSquare,
  faLink
} from '@fortawesome/free-solid-svg-icons'
import {
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem
} from 'reactstrap'
import { urlToWebapp } from '../../../Webapps/Webapp'

function ActionCellRenderer(props) {
  const app = props.data

  const handleInstallClick = () => {
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${app.name}/${app.version}`,
      {
        method: 'POST',
        credentials: 'include'
      }
    )
  }

  const handleRemoveClick = () => {
    if (confirm(`Are you sure you want to uninstall ${app.name}?`)) {
      fetch(`${window.serverRoutesPrefix}/appstore/remove/${app.name}`, {
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
                className="text-left"
                color="success"
                onClick={handleInstallClick}
              >
                <FontAwesomeIcon
                  className="icon__update mr-2"
                  icon={faCloudArrowDown}
                />
                Update
              </Button>
            ) : app.isPlugin ? (
              <NavLink
                to={`/serverConfiguration/plugins/${app.id}`}
                role="button"
                className="btn btn-light text-left"
              >
                <FontAwesomeIcon className="mr-2" icon={faGear} />
                Configure
              </NavLink>
            ) : (
              <a
                href={urlToWebapp(app)}
                role="button"
                className="btn btn-light text-left"
              >
                <FontAwesomeIcon className="mr-2" icon={faLink} />
                Open
              </a>
            )
          ) : (
            <Button
              className="text-left"
              color="light"
              onClick={handleInstallClick}
            >
              <FontAwesomeIcon className="mr-2" icon={faCloudArrowDown} />
              Install
            </Button>
          )}

          <DropdownToggle
            caret
            color={app.newVersion ? 'success' : 'light'}
            className="flex-grow-0"
          />
          <DropdownMenu right>
            {app.installed && app.newVersion && (
              <NavLink
                to={`/serverConfiguration/plugins/${app.id}`}
                className="dropdown-item"
              >
                <FontAwesomeIcon className="mr-2" icon={faGear} /> Configure
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
                  className="mr-2"
                />
                View on NPM
              </a>
            )}

            {app.installed && (
              <DropdownItem onClick={handleRemoveClick} className="text-danger">
                <FontAwesomeIcon className="mr-2" icon={faTrashCan} />
                Remove
              </DropdownItem>
            )}
          </DropdownMenu>
        </UncontrolledDropdown>
      </>
    )
  }
  return <div className="cell__renderer cell-action">{content}</div>
}

const mapStateToProps = ({ appStore }) => ({ appStore })

export default connect(mapStateToProps)(ActionCellRenderer)
