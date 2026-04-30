import { useRef, useEffect, useState } from 'react'

interface TimestampCellProps {
  timestamp: string
  isPaused: boolean
  className?: string
}

function TimestampCell({ timestamp, isPaused, className }: TimestampCellProps) {
  const prevTimestampRef = useRef(timestamp)
  // A counter that bumps on every timestamp change. Used as a React key on
  // the animated overlay so the CSS animation restarts from the beginning
  // with each new value — otherwise a continuously-updating path would fade
  // to zero once and never flash again.
  const [pulseKey, setPulseKey] = useState(0)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    // Track the latest timestamp regardless of pause state — otherwise
    // unpausing after a few updates would compare the new timestamp
    // against the value at pause time and either flash spuriously or
    // miss the next change entirely.
    const changed = timestamp !== prevTimestampRef.current
    if (changed) {
      prevTimestampRef.current = timestamp
    }
    if (isPaused) {
      setAnimate(false)
      return
    }
    if (changed) {
      setPulseKey((k) => k + 1)
      setAnimate(true)
      const timer = setTimeout(() => setAnimate(false), 15000)
      return () => clearTimeout(timer)
    }
  }, [timestamp, isPaused])

  return (
    <div
      className={`virtual-table-cell timestamp-cell ${className || ''}`}
      data-label="Time"
    >
      {animate && <span key={pulseKey} className="timestamp-updated-bar" />}
      {timestamp}
    </div>
  )
}

export default TimestampCell
