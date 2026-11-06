import type { LoginStatus } from '../store/types'

export function mayRestartServer(loginStatus: LoginStatus): boolean {
  return loginStatus.status === 'loggedIn' && loginStatus.userLevel === 'admin'
}

export function mayConfigureServer(loginStatus: LoginStatus): boolean {
  return (
    loginStatus.authenticationRequired === false ||
    mayRestartServer(loginStatus)
  )
}
