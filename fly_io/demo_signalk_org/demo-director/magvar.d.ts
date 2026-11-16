// magvar ships no type declarations
declare module 'magvar' {
  /** Magnetic variation in degrees, east positive */
  export function magvar(latitude: number, longitude: number): number
}
