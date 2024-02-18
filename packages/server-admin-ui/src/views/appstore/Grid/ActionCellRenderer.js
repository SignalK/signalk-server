import React from 'react'
import { Button } from 'reactstrap'
import { NavLink } from 'react-router-dom'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faGear,
  faTrashCan,
  faCloudArrowDown,
} from '@fortawesome/free-solid-svg-icons'

export default function ActionCellRenderer(props) {
  const handleInstallClick = async () => {
    const response = await fetch(
      `${window.serverRoutesPrefix}/appstore/install/${props.data.name}/${props.data.version}`,
      {
        method: 'POST',
        credentials: 'include',
      }
    )
    if (response.status === 200) {
      // TODO: Show the progress bar and the warning display messaege
      // Also show a restart message indicating that the user must restart the server
    }
  }

  const handleRemoveClick = async () => {
    if (confirm(`Are you sure you want to uninstall ${props.data.name}?`)) {
      const response = await fetch(
        `${window.serverRoutesPrefix}/appstore/remove/${props.data.name}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )
      if (response.status === 200) {
        // TODO: Show the user the warning message that the server must be restarted
      }
    }
  }

  const handleUpdateClick = async () => {
    /* TODO: To be implemented
    
    Install the new version 
    */
  }

  return (
    <div className="cell__renderer cell-action center">
      {props.data.installed ? (
        <>
          {props.data.updateAvailable && (
            <FontAwesomeIcon
              className="icon__update"
              icon={faCloudArrowDown}
              onClick={handleUpdateClick}
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
        <Button color="primary" onClick={handleInstallClick}>
          Install
        </Button>
      )}
    </div>
  )
}
