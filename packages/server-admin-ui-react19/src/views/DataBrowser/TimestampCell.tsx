interface TimestampCellProps {
  timestamp: string
  isPaused: boolean
  className?: string
}

// TimestampCell triggers a CSS animation when the timestamp changes.
// We use the timestamp string itself as the animation key to trigger re-animation.
// The CSS animation class is always applied when not paused - the key change
// triggers the animation restart.
function TimestampCell({ timestamp, isPaused, className }: TimestampCellProps) {
  // Use timestamp as animation key - when it changes, React remounts the element
  // which restarts the CSS animation. When paused, use static key.
  const animationKey = isPaused ? 'paused' : timestamp

  const cellClass = `virtual-table-cell timestamp-cell ${className || ''} ${
    !isPaused ? 'timestamp-updated' : ''
  }`

  return (
    <div className={cellClass} key={animationKey} data-label="Time">
      {timestamp}
    </div>
  )
}

export default TimestampCell
