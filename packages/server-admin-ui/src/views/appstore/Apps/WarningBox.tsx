import { ReactNode } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons/faTriangleExclamation'

interface WarningBoxProps {
  children: ReactNode
}

export default function WarningBox({ children }: WarningBoxProps) {
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
