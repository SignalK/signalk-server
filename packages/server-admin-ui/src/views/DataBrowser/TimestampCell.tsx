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
  // Holds the in-flight fade-out timer so we can clear it on every
  // re-run, including the changed=false branch where the previous
  // useEffect cleanup doesn't get a fresh closure.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Always cancel any pending fade-out before deciding what this
    // render should do — pause + unpause races would otherwise leave
    // a stale setTimeout firing setAnimate(false) seconds later.
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
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
      timerRef.current = setTimeout(() => {
        setAnimate(false)
        timerRef.current = null
      }, 15000)
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
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
