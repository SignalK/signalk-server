import type { LoginStatus } from '../store/types'

// Read-only visitors may see the Preferences cards; the server refuses
// their writes, so the cards lock or hide the controls that would send one.
export const isReadOnly = (loginStatus: LoginStatus) =>
  loginStatus.authenticationRequired !== false &&
  loginStatus.userLevel !== 'admin'
