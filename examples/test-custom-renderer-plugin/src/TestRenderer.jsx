import React from 'react'

/**
 * A simple custom renderer that displays a value with a colored background
 * based on its magnitude.
 */
const TestRenderer = ({ value }) => {
  // Determine color based on value
  let backgroundColor = '#d4edda' // green
  let color = '#155724'

  if (typeof value === 'number') {
    if (value > 100) {
      backgroundColor = '#f8d7da' // red
      color = '#721c24'
    } else if (value > 50) {
      backgroundColor = '#fff3cd' // yellow
      color = '#856404'
    }
  }

  return (
    <div
      style={{
        padding: '4px 8px',
        borderRadius: '4px',
        backgroundColor,
        color,
        fontWeight: 'bold',
        display: 'inline-block'
      }}
    >
      🧪 {typeof value === 'number' ? value.toFixed(2) : String(value)}
    </div>
  )
}

export default TestRenderer
