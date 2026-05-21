import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ReadmeTabProps {
  readme: string
  screenshots: string[]
  packageName: string
  version: string
  onScreenshotClick?: (index: number) => void
}

// Same cap the publishing docs advertise to plugin authors and the
// detail-payload schema validates at the boundary.
const MAX_SCREENSHOTS = 6

// Collapse `.` / `..` segments and clamp to the package root so a
// crafted README image link can't escape the unpkg namespace into a
// sibling package's CDN path. Mirrors the same clamp the backend uses
// in src/appstore/cdn.ts.
function clampToPackageRoot(rel: string): string {
  const normalized = rel.replace(/\\/g, '/').replace(/^(?:\.?\/)+/, '')
  const stack: string[] = []
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

function rewriteRelativeImages(
  markdown: string,
  packageName: string,
  version: string
): string {
  const prefix = `https://unpkg.com/${packageName}@${version}/`
  return markdown.replace(
    /!\[([^\]]*)\]\((\.?\/?)([^)\s]+)\)/g,
    (match, alt, lead, path) => {
      // Test against the full original target (lead + path). The
      // regex captures any leading `.` or `/` into `lead` so a fully
      // absolute path like `/foo.png` arrives here with lead='/' and
      // path='foo.png'; matching only `path` would have rewritten
      // absolute links to unpkg URLs by mistake.
      if (/^(https?:|data:|\/\/|\/)/.test(lead + path)) return match
      return `![${alt}](${prefix}${clampToPackageRoot(path)})`
    }
  )
}

const ReadmeTab: React.FC<ReadmeTabProps> = ({
  readme,
  screenshots,
  packageName,
  version,
  onScreenshotClick
}) => {
  const hasReadme = readme && readme.trim().length > 0
  const rewritten = hasReadme
    ? rewriteRelativeImages(readme, packageName, version)
    : ''

  return (
    <div className="d-flex gap-4 flex-column flex-lg-row">
      <div
        className="flex-grow-1 plugin-detail__readme plugin-detail__markdown"
        style={{ minWidth: 0 }}
      >
        {hasReadme ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{rewritten}</ReactMarkdown>
        ) : (
          <p className="text-muted">This plugin doesn&apos;t ship a README.</p>
        )}
        {screenshots.length === 0 && (
          <div className="plugin-detail__no-screenshots mt-4 text-muted small">
            This plugin does not provide screenshots. Authors can add them by
            listing package-relative paths under{' '}
            <code>signalk.screenshots</code> in <code>package.json</code>.
          </div>
        )}
      </div>
      {screenshots.length > 0 && (
        <div
          className="plugin-detail__screenshots"
          style={{ flexBasis: '40%', flexShrink: 0 }}
        >
          <div className="row g-2">
            {screenshots.slice(0, MAX_SCREENSHOTS).map((src, idx) => (
              <div className="col-6" key={`${src}-${idx}`}>
                <button
                  type="button"
                  className="plugin-detail__screenshot-button"
                  onClick={() => onScreenshotClick?.(idx)}
                  aria-label={`Open screenshot ${idx + 1}`}
                >
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="plugin-detail__screenshot img-fluid rounded"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default ReadmeTab
