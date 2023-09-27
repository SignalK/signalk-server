import { IRouter } from 'express'
import { createDebug } from './debug'
import { SecurityConfig } from './security'
import cors, { CorsOptions } from 'cors'

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
  const corsOptions: CorsOptions = {
    credentials: true,
    origin: corsOrigins
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
