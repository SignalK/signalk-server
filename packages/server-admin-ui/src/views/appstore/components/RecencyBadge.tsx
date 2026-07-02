import React from 'react'
import Badge from 'react-bootstrap/Badge'

interface RecencyBadgeProps {
  recent?: boolean
  className?: string
}

// Visible flag that the package was published within the recency
// window (server-side isRecent). Single label regardless of install
// state: 'Recent' applies to any package that was recently published,
// and the 'an update is available' signal is the separate UPDATE
// badge that matches the 'Updates' filter button.
const RecencyBadge: React.FC<RecencyBadgeProps> = ({ recent, className }) => {
  if (!recent) return null
  return (
    <Badge bg="info" className={className}>
      RECENT
    </Badge>
  )
}

export default RecencyBadge
