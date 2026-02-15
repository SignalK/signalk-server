export default function EmbeddedAsyncApi() {
  const src = `${window.location.protocol}//${window.location.host}/skServer/asyncapi/docs`

  return (
    <iframe
      src={src}
      style={{
        width: '100%',
        height: 'calc(100vh - 55px)',
        border: 'none'
      }}
      title="Signal K WebSocket API"
      // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox -- trusted same-origin AsyncAPI viewer
      sandbox="allow-scripts allow-same-origin"
    />
  )
}
