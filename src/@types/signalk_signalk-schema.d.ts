/* eslint-disable @typescript-eslint/no-explicit-any */
declare module '@signalk/signalk-schema' {
  export function internalGetMetadata(path: string): any
  export function fillIdentity(full: any): void
  export function addMetaData(contextPath: any, path: any, value: any): void
}
