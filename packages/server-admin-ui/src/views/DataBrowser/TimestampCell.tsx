import { useState, useEffect, useRef, memo } from 'react'

interface TimestampCellProps {
  timestamp: string
  isPaused: boolean
  className?: string
}

/**
 * TimestampCell - Displays timestamp with fade animation on update
 */
function TimestampCell({ timestamp, isPaused, className }: TimestampCellProps) {
  const [isUpdated, setIsUpdated] = useState(false)
  const prevTimestamp = useRef(timestamp)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

export default memo(TimestampCell)
