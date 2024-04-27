import React from 'react'

export default function Meta(meta) {
  const formatted = JSON.stringify(meta, null, 2)

  return (
    <pre className="text-primary" style={{ whiteSpace: 'pre-wrap' }}>
      {formatted}
    </pre>
  )
}
