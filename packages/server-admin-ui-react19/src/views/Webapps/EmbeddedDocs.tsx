import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function EmbeddedDocs() {
  const location = useLocation()
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const currentPathRef = useRef(location.pathname)
  const currentHashRef = useRef(location.hash)

  const docsBase = `${window.location.protocol}//${window.location.host}/documentation/`
  const routeSubPath = location.pathname.replace('/documentation', '') || '/'
  const initialSrc =
    docsBase + routeSubPath.replace(/^\//, '') + (location.hash || '')

  useEffect(() => {
    currentPathRef.current = location.pathname
    currentHashRef.current = location.hash
  }, [location.pathname, location.hash])

  useEffect(() => {
    document.body.classList.add('sidebar-hidden')
    return () => {
      document.body.classList.remove('sidebar-hidden')
    }
  }, [])

  const handleIframeLoad = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    try {
      const iframePath = iframe.contentWindow.location.pathname
      const hash = iframe.contentWindow.location.hash || ''
      const subPath = iframePath.replace('/documentation', '') || '/'
      const currentRouteSubPath =
        currentPathRef.current.replace('/documentation', '') || '/'
      if (subPath !== currentRouteSubPath || hash !== currentHashRef.current) {
        navigate('/documentation' + subPath + hash, { replace: true })
      }

      iframe.contentWindow.addEventListener('hashchange', () => {
        const newHash = iframe.contentWindow!.location.hash || ''
        const currentSubPath =
          iframe.contentWindow!.location.pathname.replace(
            '/documentation',
            ''
          ) || '/'
        navigate('/documentation' + currentSubPath + newHash, { replace: true })
      })
    } catch (_e) {
      // Cross-origin fallback (shouldn't happen with same-origin docs)
    }
  }, [navigate])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe?.contentWindow) return
    try {
      const iframePath = iframe.contentWindow.location.pathname
      const iframeSubPath = iframePath.replace('/documentation', '') || '/'
      const iframeHash = iframe.contentWindow.location.hash || ''
      if (
        routeSubPath !== iframeSubPath ||
        (location.hash || '') !== iframeHash
      ) {
        iframe.contentWindow.location.href =
          docsBase + routeSubPath.replace(/^\//, '') + (location.hash || '')
      }
    } catch (_e) {
      // Cross-origin fallback
    }
  }, [docsBase, routeSubPath, location.hash])

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
        // eslint-disable-next-line @eslint-react/dom/no-unsafe-iframe-sandbox -- trusted same-origin server docs
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  )
}
