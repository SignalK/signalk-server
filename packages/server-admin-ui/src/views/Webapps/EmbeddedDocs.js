import React from 'react'

const EmbeddedDocs = () => {
  const docsUrl = `${window.location.protocol}//${window.location.host}/documentation/`

  return (
    <iframe
      src={docsUrl}
      style={{
        width: '100%',
        height: 'calc(100vh - 55px)',
        border: 'none'
      }}
      title="Signal K Documentation"
    />
  )
}

export default EmbeddedDocs
