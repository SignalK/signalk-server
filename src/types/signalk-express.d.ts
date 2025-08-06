/**
 * Type declarations for SignalK Express extensions
 */

declare global {
  namespace Express {
    interface Request {
      /**
       * SignalK authentication status
       */
      skIsAuthenticated?: boolean

      /**
       * SignalK principal/user information
       */
      skPrincipal?: {
        identifier: string
        permissions: 'admin' | 'readwrite' | 'readonly'
      }

      /**
       * User logged in status
       */
      userLoggedIn?: boolean
    }
  }
}

export {}
