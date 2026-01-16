export default function EmbeddedDocs() {
  const docsUrl = `${window.location.protocol}//${window.location.host}/documentation/`

  return (
    <div style={{ backgroundColor: '#0d1117', margin: 0, padding: 0 }}>
      <iframe
        src={docsUrl}
        style={{
          width: '100%',
          height: 'calc(100vh - 55px)',
          border: 'none'
        }}
        title="Signal K Documentation"
      />
    </div>
  )
}
