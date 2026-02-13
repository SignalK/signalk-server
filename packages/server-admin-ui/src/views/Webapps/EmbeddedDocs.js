import React, { useEffect, useRef } from 'react'

const EmbeddedDocs = ({ location, history }) => {
  const iframeRef = useRef(null)
  const currentPathRef = useRef(location.pathname)
  const currentHashRef = useRef(location.hash)
  const docsBase = `${window.location.protocol}//${window.location.host}/documentation/`

  currentPathRef.current = location.pathname
  currentHashRef.current = location.hash

  const routeSubPath = location.pathname.replace('/documentation', '') || '/'
  const initialSrc =
    docsBase + routeSubPath.replace(/^\//, '') + (location.hash || '')

  useEffect(() => {
    document.body.classList.add('sidebar-hidden')
    return () => {
      document.body.classList.remove('sidebar-hidden')
    }
  }, [])

  const handleIframeLoad = () => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const iframePath = iframe.contentWindow.location.pathname
      const hash = iframe.contentWindow.location.hash || ''
      const subPath = iframePath.replace('/documentation', '') || '/'
      const currentRouteSubPath =
        currentPathRef.current.replace('/documentation', '') || '/'
      if (subPath !== currentRouteSubPath || hash !== currentHashRef.current) {
        history.replace('/documentation' + subPath + hash)
      }

      iframe.contentWindow.addEventListener('hashchange', () => {
        const newHash = iframe.contentWindow.location.hash || ''
        const currentSubPath =
          iframe.contentWindow.location.pathname.replace(
            '/documentation',
            ''
          ) || '/'
        history.replace('/documentation' + currentSubPath + newHash)
      })
    } catch (_e) {
      // Cross-origin fallback (shouldn't happen with same-origin docs)
    }
  }

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !iframe.contentWindow) return
    try {
      const iframePath = iframe.contentWindow.location.pathname
      const iframeSubPath = iframePath.replace('/documentation', '') || '/'
      const iframeHash = iframe.contentWindow.location.hash || ''
      if (
        routeSubPath !== iframeSubPath ||
        (location.hash || '') !== iframeHash
      ) {
        iframe.contentWindow.location =
          docsBase + routeSubPath.replace(/^\//, '') + (location.hash || '')
      }
    } catch (_e) {
      // Cross-origin fallback
    }
  }, [location.pathname, location.hash])

  return (
    <div style={{ backgroundColor: '#0d1117', margin: 0, padding: 0 }}>
      <iframe
        ref={iframeRef}
        src={initialSrc}
        onLoad={handleIframeLoad}
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

export default EmbeddedDocs
