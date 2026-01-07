import React, { useState, useEffect, useRef } from 'react'

/**
 * TimestampCell - Displays timestamp with fade animation on update
 * Note: Removed key={animationKey} which was causing DOM element recreation
 * on every update, leading to memory leaks. CSS class toggle handles animation.
 */
function TimestampCell({ timestamp, isPaused, className }) {
  const [isUpdated, setIsUpdated] = useState(false)
  const prevTimestamp = useRef(timestamp)
  const timeoutRef = useRef(null)

  useEffect(() => {
    if (prevTimestamp.current !== timestamp) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      setIsUpdated(true)

      timeoutRef.current = setTimeout(() => {
        if (!isPaused) {
          setIsUpdated(false)
        }
      }, 15000)

      prevTimestamp.current = timestamp
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [timestamp, isPaused])

  // Reset animation when paused
  useEffect(() => {
    if (isPaused) {
      setIsUpdated(false)
    }
  }, [isPaused])

  const cellClass = `virtual-table-cell timestamp-cell ${className || ''} ${
    isUpdated && !isPaused ? 'timestamp-updated' : ''
  }`

  return <div className={cellClass}>{timestamp}</div>
}

export default React.memo(TimestampCell)
