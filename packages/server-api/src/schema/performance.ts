import { Source } from './metadata'
import { FullValue } from './values'

/**
 * Performance Sailing data including VMG, Polar Speed, tack angle, etc.
 */
export interface Performance {
  polars?: PolarUuid
  /**
   * The UUID of the active polar table
   */
  activePolar?: string
  activePolarData?: Polar
  polarSpeed?: FullValue<number>
  polarSpeedRatio?: FullValue<number>
  velocityMadeGood?: FullValue<number>
  velocityMadeGoodToWaypoint?: FullValue<number>
  beatAngle?: FullValue<number>
  beatAngleVelocityMadeGood?: FullValue<number>
  beatAngleTargetSpeed?: FullValue<number>
  gybeAngle?: FullValue<number>
  gybeAngleVelocityMadeGood?: FullValue<number>
  gybeAngleTargetSpeed?: FullValue<number>
  targetAngle?: FullValue<number>
  targetSpeed?: FullValue<number>
  leeway?: FullValue<number>
  tackMagnetic?: FullValue<number>
  tackTrue?: FullValue<number>
}
/**
 * Polar objects
 */
export interface PolarUuid {
  [k: string]: Polar
}

export interface Polar {
  id: string
  name: string
  description?: string
  source?: Source
  windData: {
    /**
     * The true wind speed for the polar values
     */
    trueWindSpeed: number
    /**
     * Optimal beating values, angle and boat speed. One element if symmetrical, two if not
     *
     * @maxItems 2
     */
    optimalBeats?:
    | []
    | [[number, number]]
    | [[number, number], [number, number]]
    /**
     * Optimal gybe values, angle and boat speed. One element if symmetrical, two if not
     *
     * @maxItems 2
     */
    optimalGybes?:
    | []
    | [[number, number]]
    | [[number, number], [number, number]]
    /**
     * The polar table for the specific wind speed, comprising of wind angles and boat speeds
     */
    angleData: [number, number] | [number, number, number][]
  }[]
}
