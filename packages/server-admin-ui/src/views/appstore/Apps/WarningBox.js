import React from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'

export default function WarningBox({ children }) {
  return (
    <div className="message__container">
      <p className="message">
        <span>
          <FontAwesomeIcon icon={faTriangleExclamation} />
        </span>
        {children}
      </p>
    </div>
  )
}
