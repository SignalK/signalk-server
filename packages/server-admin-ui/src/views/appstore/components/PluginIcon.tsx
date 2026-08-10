import React, { useEffect, useRef, useState } from 'react'
import { monogramFor } from '../../../utils/monogram'

interface PluginIconProps {
  name: string
  displayName?: string
  appIcon?: string
  installedIconUrl?: string
  size?: number
}

// Stable per-name pastel hue so the monogram tile reads as the plugin's
// own mark, not a placeholder. djb2-like hash is deterministic and
// cheap, fine for what is otherwise a visual sugar.
function hueFor(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) {
    h = (h * 33) ^ name.charCodeAt(i)
  }
  return (h >>> 0) % 360
}

const PluginIcon: React.FC<PluginIconProps> = ({
  name,
  displayName,
  appIcon,
  installedIconUrl,
  size = 48
}) => {
  // Prefer the server's own mount (e.g. /@signalk/freeboard-sk/assets/icons/icon-72x72.png)
  // because it's what the Webapps view uses and it always works for installed plugins.
  // The CDN-probed URL (appIcon) is gated on visibility — see hasBeenVisible
  // below — to keep first paint cheap and to respect end-user CDN rate
  // limits when a list of dozens of cards is rendered.
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hasBeenVisible, setHasBeenVisible] = useState(false)

  useEffect(() => {
    if (hasBeenVisible) return
    if (typeof IntersectionObserver === 'undefined') {
      // Older browsers / SSR: act as if always visible. Cheaper than
      // shipping a polyfill for what is a progressive enhancement.
      // Capability probe: IntersectionObserver support can only be checked
      // once mounted, so this cannot be derived during render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasBeenVisible(true)
      return
    }
    const node = containerRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setHasBeenVisible(true)
            observer.disconnect()
            break
          }
        }
      },
      { rootMargin: '120px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasBeenVisible])

  const candidates: string[] = []
  if (installedIconUrl) candidates.push(installedIconUrl)
  if (hasBeenVisible && appIcon && appIcon !== installedIconUrl) {
    candidates.push(appIcon)
  }

  const [failedIndex, setFailedIndex] = useState(-1)
  // Reset the fallback walk when the candidate set changes, otherwise a
  // component reused for a different plugin (or the same plugin gaining
  // a new installedIconUrl after install) keeps its old failedIndex and
  // skips straight to the monogram even though the new URL is fine.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailedIndex(-1)
  }, [installedIconUrl, appIcon])
  const activeSrc = candidates[failedIndex + 1]

  const wrapperStyle: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: 8,
    overflow: 'hidden',
    display: 'inline-block'
  }

  if (activeSrc) {
    return (
      <div ref={containerRef} style={wrapperStyle}>
        <img
          key={activeSrc}
          src={activeSrc}
          alt=""
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            objectFit: 'cover',
            background: '#f0f3f5'
          }}
          onError={() => setFailedIndex(failedIndex + 1)}
        />
      </div>
    )
  }

  const monogram = monogramFor(name, displayName)
  const hue = hueFor(name)
  return (
    <div
      ref={containerRef}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 8,
        background: `linear-gradient(135deg, hsl(${hue}, 45%, 58%), hsl(${(hue + 30) % 360}, 50%, 42%))`,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        letterSpacing: '0.02em',
        textShadow: '0 1px 1px rgba(0,0,0,0.15)',
        // Defensive: when this fallback is wrapped in a NavLink (cards
        // and rows do that), Bootstrap's anchor underline would otherwise
        // draw a line beneath the monogram letters.
        textDecoration: 'none'
      }}
      aria-hidden="true"
    >
      {monogram}
    </div>
  )
}

export default PluginIcon
