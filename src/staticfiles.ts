import { RequestHandler } from 'express'
import expressStaticGzip from 'express-static-gzip'

/**
 * Static file serving for bundled assets, webapps and plugin UIs.
 *
 * Serves precompressed sidecar files (`asset.js.br` / `asset.js.gz`,
 * generated at build time) when the client accepts the encoding, falling
 * back to the plain file. Shipping sidecars is a package's opt-in — no
 * manifest flag needed. The root directory is scanned once at mount time,
 * so sidecars added later are picked up on server restart.
 */
export function serveStaticFiles(root: string): RequestHandler {
  const middleware = expressStaticGzip(root, {
    enableBrotli: true,
    orderPreference: ['br']
  })
  // express-static-gzip rewrites req.url in place (directory requests get
  // index.html appended, compressed hits get the sidecar extension) and
  // does not undo this when no file matches, so downstream routes would
  // see the mangled url — e.g. /signalk/v1/api/ arriving at the REST
  // interface as /signalk/v1/api/index.html. Restore the url whenever the
  // request falls through.
  return (req, res, next) => {
    const originalUrl = req.url
    middleware(req, res, (err?: unknown) => {
      req.url = originalUrl
      next(err)
    })
  }
}
