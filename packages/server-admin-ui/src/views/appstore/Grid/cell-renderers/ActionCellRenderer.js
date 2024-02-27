import React, { useMemo } from 'react'
import { Button, Progress } from 'reactstrap'
import { NavLink } from 'react-router-dom'
import { connect } from 'react-redux'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGear,
  faTrashCan,
  faCloudArrowDown,
} from '@fortawesome/free-solid-svg-icons'

function ActionCellRenderer(props) {
  const progressingApp = useMemo(() => {
    return props.appStore.installing.find((el) => el.name === props.data.name)
  }, [props.appStore.installing])

  const updateInstalling = (name, value) => {
    props.appStore.installing[name] = value
  }

  const handleInstallClick = () => {
    updateInstalling(props.data.name, true)
    fetch(
      `${window.serverRoutesPrefix}/appstore/install/${props.data.name}/${props.data.version}`,
      {
        method: 'POST',
        credentials: 'include',
      }
    )
  }

  const handleRemoveClick = () => {
    updateInstalling(props.data.name, true)
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

  if (progressingApp) {
    // Read the status of the progressing app
    // If the app has progressed we show the status

    if (
      progressingApp.isInstalling ||
      progressingApp.isRemoving ||
      progressingApp.isWaiting
    ) {
      status = progressingApp.isRemove ? 'Removing' : 'Installing'
      progress = (
        <Progress
          className="progress-sm progress__bar"
          animated
          color="success"
          value="100"
        />
      )
    } else if (progressingApp.installFailed) {
      status = 'Failed'
    } else {
      status = 'Installed '
      status = progressingApp.isRemove ? 'Removed' : 'Installed'
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
        {props.data.updateAvailable && (
          <FontAwesomeIcon
            className="icon__update"
            icon={faCloudArrowDown}
            onClick={handleInstallClick}
          />
        )}

        <NavLink to={`/serverConfiguration/plugins/${props.data.name}`}>
          <FontAwesomeIcon className="icon__config" icon={faGear} />
        </NavLink>

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
  return <div className="cell__renderer cell-action center">{content}</div>
}

const mapStateToProps = ({ appStore }) => ({ appStore })

export default connect(mapStateToProps)(ActionCellRenderer)
