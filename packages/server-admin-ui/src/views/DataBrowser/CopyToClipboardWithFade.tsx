import { useState, useCallback, ReactNode } from 'react'
import { copyToClipboard } from '../../utils/clipboard'

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
