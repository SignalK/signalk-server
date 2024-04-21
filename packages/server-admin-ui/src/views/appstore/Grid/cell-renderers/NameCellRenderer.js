import React from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'

export default function NameCellRenderer(props) {
  return (
    <div className="cell__renderer cell-name">
      <span className="name">{props.value}</span>
      {props.data.npmUrl && (
        <a className="link" href={props.data.npmUrl} target="_blank">
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
        </a>
      )}
    </div>
  )
}
