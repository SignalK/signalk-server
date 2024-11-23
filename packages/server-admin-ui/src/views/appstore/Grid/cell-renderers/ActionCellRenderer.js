import React from 'react'
import { Button, Progress } from 'reactstrap'
import { connect } from 'react-redux'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashCan, faCloudArrowDown } from '@fortawesome/free-solid-svg-icons'

function ActionCellRenderer(props) {
  const app = props.data

  const handleInstallClick = () => {
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${props.data.name}/${props.data.version}`,
      {
        method: 'POST',
        credentials: 'include',
      }
    )
  }

  const handleRemoveClick = () => {
    if (confirm(`Are you sure you want to uninstall ${props.data.name}?`)) {
      fetch(`${window.serverRoutesPrefix}/appstore/remove/${props.data.name}`, {
        method: 'POST',
        credentials: 'include',
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
      </>
    ) : (
      <Button
        className="button__install"
        color="primary"
        onClick={handleInstallClick}
      >
        Install
      </Button>
    )
  }
  return (
    <div className="cell__renderer cell-action center">
      <div>{content}</div>
    </div>
  )
}

const mapStateToProps = ({ appStore }) => ({ appStore })

export default connect(mapStateToProps)(ActionCellRenderer)
