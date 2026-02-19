export default function EmbeddedOpenApi() {
  const src = `${window.location.protocol}//${window.location.host}/doc/openapi`

  return (
    <iframe
      src={src}
      style={{
        width: '100%',
        height: 'calc(100vh - 55px)',
        border: 'none'
      }}
      title="Signal K HTTP API"
      // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox -- trusted same-origin Swagger UI
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  )
}
