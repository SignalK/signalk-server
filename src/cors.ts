import { IRouter } from 'express'
import { createDebug } from './debug'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ACL, Device, SecurityConfig } from './security'
import cors, { CorsOptions } from 'cors'

type OriginCallback = (err: Error | null, origin?: string) => void

export function setupCors(
  app: IRouter,
  { allowedCorsOrigins }: SecurityConfig
) {
  const corsDebug = createDebug('signalk-server:cors')

  const corsOrigins = allowedCorsOrigins
    ? allowedCorsOrigins
        .split(',')
        .map((s: string) => s.trim().replace(/\/*$/, ''))
    : []
  corsDebug(`corsOrigins:${corsOrigins.toString()}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const corsOptions: CorsOptions = {
    credentials: true
  }
  if (corsOrigins.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    corsOptions.origin = (origin: string | undefined, cb: OriginCallback) => {
      if (origin === undefined || corsOrigins.indexOf(origin) >= 0) {
        corsDebug(`${origin} OK`)
        cb(null, origin)
      } else {
        const errorMsg = `${origin} not allowed`
        corsDebug(errorMsg)
        cb(new Error(errorMsg))
      }
    }
  }
  app.use(cors(corsOptions))
}

export const handleAdminUICORSOrigin = (
  securityConfig: SecurityConfig & { adminUIOrigin: string }
) => {
  let allowedCorsOrigins: string[] = []
  if (
    securityConfig.adminUIOrigin &&
    securityConfig.allowedCorsOrigins &&
    securityConfig.allowedCorsOrigins.length > 0
  ) {
    allowedCorsOrigins = securityConfig.allowedCorsOrigins?.split(',')
    if (allowedCorsOrigins.indexOf(securityConfig.adminUIOrigin) === -1) {
      allowedCorsOrigins.push(securityConfig.adminUIOrigin)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { adminUIOrigin, ...configWithoutAdminUIOrigin } = securityConfig
  return {
    ...configWithoutAdminUIOrigin,
    allowedCorsOrigins: allowedCorsOrigins.join(',')
  }
}
