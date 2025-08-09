import express from 'express'

/**
 * TSOA authentication middleware for SignalK security integration
 * This function is called by TSOA for routes decorated with @Security
 */
export async function expressAuthentication(
  request: express.Request,
  securityName: string,
  scopes?: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (securityName === 'signalK') {
    return new Promise((resolve, reject) => {
      // Check if security is enabled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const app = request.app as any
      const securityStrategy = app.securityStrategy

      // If security is disabled (dummysecurity), allow all requests
      if (securityStrategy && !securityStrategy.supportsLogin) {
        // dummysecurity doesn't have supportsLogin method
        resolve({ identifier: 'dummy', permissions: 'admin' })
        return
      }

      // Check if user is authenticated (set by SignalK's http_authorize middleware)
      if (!request.skIsAuthenticated) {
        // Check if readonly access is allowed
        if (
          securityStrategy &&
          securityStrategy.allowReadOnly &&
          securityStrategy.allowReadOnly()
        ) {
          // For read-only operations, allow unauthenticated access
          if (!scopes || scopes.length === 0 || scopes.includes('read')) {
            resolve({ identifier: 'AUTO', permissions: 'readonly' })
            return
          }
        }
        reject(new Error('Authentication required'))
        return
      }

      // Check permissions based on scopes
      const userPermissions = request.skPrincipal?.permissions

      // Check for write permissions
      if (scopes?.includes('write')) {
        if (
          !userPermissions ||
          !['admin', 'readwrite'].includes(userPermissions)
        ) {
          reject(new Error('Write permission required'))
          return
        }
      }

      // Check for admin permissions
      if (scopes?.includes('admin')) {
        if (userPermissions !== 'admin') {
          reject(new Error('Admin permission required'))
          return
        }
      }

      // Check for read permissions (default - all authenticated users)
      if (scopes?.includes('read') || !scopes || scopes.length === 0) {
        // All authenticated users have at least read access
        resolve(request.skPrincipal)
        return
      }

      resolve(request.skPrincipal)
    })
  }

  return Promise.reject(new Error('Unknown security method'))
}
