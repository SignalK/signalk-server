import React, { useState, useCallback } from 'react'
import { CopyToClipboard } from 'react-copy-to-clipboard'

/**
 * CopyToClipboardWithFade - Wrapper that provides visual feedback on copy
 */
function CopyToClipboardWithFade({ text, children }) {
  const [opacity, setOpacity] = useState(1)

  const handleCopy = useCallback(() => {
    setOpacity(0.5)
    setTimeout(() => {
      setOpacity(1)
    }, 500)
  }, [])

  return (
    <CopyToClipboard text={text} onCopy={handleCopy}>
      <span style={{ opacity, cursor: 'pointer' }}>{children}</span>
    </CopyToClipboard>
  )
}

export default React.memo(CopyToClipboardWithFade)
