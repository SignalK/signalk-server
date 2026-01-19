import { useState, useEffect, useRef } from 'react'

interface TimestampCellProps {
  timestamp: string
  isPaused: boolean
  className?: string
}

function TimestampCell({ timestamp, isPaused, className }: TimestampCellProps) {
  const [animationKey, setAnimationKey] = useState(0)
  const prevTimestamp = useRef(timestamp)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (prevTimestamp.current !== timestamp) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      setAnimationKey((k) => k + 1)

      timeoutRef.current = setTimeout(() => {
        if (!isPaused) {
          setAnimationKey(0)
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

  useEffect(() => {
    if (isPaused) {
      setAnimationKey(0)
    }
  }, [isPaused])

  const isAnimating = animationKey > 0 && !isPaused
  const cellClass = `virtual-table-cell timestamp-cell ${className || ''} ${
    isAnimating ? 'timestamp-updated' : ''
  }`

  return (
    <div
      className={cellClass}
      key={isAnimating ? animationKey : 'static'}
      data-label="Time"
    >
      {timestamp}
    </div>
  )
}

export default TimestampCell
