export function copyToClipboard(text: string): Promise<void> {
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

  try {
    const success = document.execCommand('copy')
    return success
      ? Promise.resolve()
      : Promise.reject(new Error('execCommand copy failed'))
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)))
  } finally {
    document.body.removeChild(textArea)
  }
}
