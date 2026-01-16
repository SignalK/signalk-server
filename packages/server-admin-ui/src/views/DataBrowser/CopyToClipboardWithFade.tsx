import { useState, useCallback, memo, ReactNode } from 'react'

/**
 * Copy text to clipboard with fallback for non-HTTPS contexts
 */
function copyToClipboard(text: string): Promise<void> {
  // Try modern Clipboard API first (requires HTTPS or localhost)
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }

  // Fallback for HTTP: use deprecated execCommand
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  textArea.style.top = '-9999px'
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()

  return new Promise((resolve, reject) => {
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    if (success) {
      resolve()
    } else {
      reject(new Error('execCommand copy failed'))
    }
  })
}

interface CopyToClipboardWithFadeProps {
  text: string
  children: ReactNode
}

/**
 * CopyToClipboardWithFade - Wrapper that provides visual feedback on copy
 */
function CopyToClipboardWithFade({
  text,
  children
}: CopyToClipboardWithFadeProps) {
  const [opacity, setOpacity] = useState(1)

  const handleClick = useCallback(() => {
    copyToClipboard(text).then(() => {
      setOpacity(0.5)
      setTimeout(() => {
        setOpacity(1)
      }, 500)
    })
  }, [text])

  return (
    <span style={{ opacity, cursor: 'pointer' }} onClick={handleClick}>
      {children}
    </span>
  )
}

export default memo(CopyToClipboardWithFade)
