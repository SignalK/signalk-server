import React from 'react'
import { Button } from 'reactstrap'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGear, faTrashCan } from '@fortawesome/free-solid-svg-icons'

export default function ActionCellRenderer(props) {
  const handleInstallClick = () => {
    /* TODO: TO BE IMPLEMENTED */
  }
  return (
    <div className="cell__renderer cell-action center">
      {props.data.installed ? (
        <>
          <FontAwesomeIcon icon={faTrashCan} />
          <FontAwesomeIcon icon={faGear} />{' '}
        </>
      ) : (
        <Button color="primary" onClick={handleInstallClick}>
          Install
        </Button>
      )}
    </div>
  )
}
