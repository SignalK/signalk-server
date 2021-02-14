export interface Bus {
  onValue: (callback: (value: any) => any) => () => void
  push: (v: any) => void
  scan: (
    a: any,
    f: (a: any, b: any) => any | void
  ) => {
    toProperty: () => () => void
  }
}
