import React from 'react'
import Badge from 'react-bootstrap/Badge'

interface UpdateAvailableBadgeProps {
  installedVersion?: string
  newVersion?: string
  className?: string
}

// Shown when an installed plugin has a newer version available.
// Matches the 'Updates' filter button so the same word names the
// signal and the filter that surfaces it.
const UpdateAvailableBadge: React.FC<UpdateAvailableBadgeProps> = ({
  installedVersion,
  newVersion,
  className
}) => {
  if (!installedVersion || !newVersion) return null
  if (installedVersion === newVersion) return null
  return (
    <Badge bg="success" className={className}>
      UPDATE
    </Badge>
  )
}

export default UpdateAvailableBadge
