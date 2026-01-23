export default function EmbeddedDocs() {
  const docsUrl = `${window.location.protocol}//${window.location.host}/documentation/`

  // Same-origin documentation requires scripts and same-origin access to function properly

  return (
    <iframe
      src={docsUrl}
      style={{
        width: '100%',
        height: 'calc(100vh - 55px)',
        border: 'none'
      }}
      title="Signal K Documentation"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups" // eslint-disable-line @eslint-react/dom/no-unsafe-iframe-sandbox -- same-origin docs require scripts+same-origin
    />
  )
}
