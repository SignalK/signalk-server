import { IRouter } from 'express'
import { createDebug } from './debug'
import { SecurityConfig } from './security'
import cors, { CorsOptions } from 'cors'

export function setupCors(
  app: IRouter,
  { allowedCorsOrigins }: SecurityConfig
) {
  const corsDebug = createDebug('signalk-server:cors')

  const corsOptions: CorsOptions = {
    credentials: true
  }

  const corsOrigins = allowedCorsOrigins
    ? allowedCorsOrigins
        .split(',')
        .map((s: string) => s.trim().replace(/\/*$/, ''))
    : []

  // default wildcard cors configuration does not work
  // with credentials:include client requests, so add
  // our own wildcard rule that will match all origins
  // but respond with that origin, not the default *
  if (allowedCorsOrigins?.startsWith('*')) {
    corsOptions.origin = (origin: string | undefined, cb) => cb(null, origin)
    corsDebug('Allowing all origins')
  } else if (corsOrigins.length > 0) {
    // set origin only if corsOrigins are set so that
    // we get the default cors module functionality
    // for simple requests by default
    corsOptions.origin = corsOrigins
    corsDebug(`corsOrigins:${corsOrigins.toString()}`)
  }

  app.use(cors(corsOptions))
  app.use((req, res, next) => {
    const origin = req.header('origin')
    if (origin !== undefined && !corsOrigins.includes(origin)) {
      corsDebug(
        `${origin} is not present in corsOrigins: ${corsOrigins.toString()}`
      )
    } else {
      corsDebug(`${origin} is allowed`)
    }
    next()
  })
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
    const adminUIOriginUrl = new URL(securityConfig.adminUIOrigin)
    if (
      allowedCorsOrigins.indexOf(securityConfig.adminUIOrigin) === -1 &&
      adminUIOriginUrl.hostname !== 'localhost'
    ) {
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
