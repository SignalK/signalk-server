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
  return expressStaticGzip(root, {
    enableBrotli: true,
    orderPreference: ['br']
  })
}
