import { useState, useCallback, ReactNode } from 'react'

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text)
  }

  // Fallback for HTTP (Clipboard API requires secure context)
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

export default CopyToClipboardWithFade
