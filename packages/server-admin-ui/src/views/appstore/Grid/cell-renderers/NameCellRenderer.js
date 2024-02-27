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
        <p className="version">
          v{props.data.installedVersion || props.data.version}
        </p>
        {props.data.updateAvailable && (
          <>
            <span className="update__arrow">
              <FontAwesomeIcon icon={faArrowRight} />
            </span>
            <p className="version version--update">
              v{props.data.updateAvailable}
            </p>
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
