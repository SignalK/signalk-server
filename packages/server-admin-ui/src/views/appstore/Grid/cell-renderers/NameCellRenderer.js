import React from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUpRightFromSquare,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons'

export default function NameCellRenderer(props) {
  return (
    <div className="cell__renderer cell-name">
      <span className="name">{props.value}</span>
      <div className="version__container">
        <span className="version">
          v{props.data.installedVersion || props.data.version}
        </span>
        &nbsp; ({props.data.updated.substring(0, 10)})
        {props.data.updateAvailable && (
          <>
            <span className="update__arrow">
              <FontAwesomeIcon icon={faArrowRight} />
            </span>
            <span className="version version--update">
              v{props.data.updateAvailable}
            </span>
          </>
        )}
        {props.data.npmUrl && (
          <a className="link" href={props.data.npmUrl} target="_blank">
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
          </a>
        )}
      </div>
    </div>
  )
}
