import { FullValue } from './values'

export interface Tank {
  /**
   * The name of the tank. Useful if multiple tanks of a certain type are on board
   */
  name?: string
  /**
   * The type of tank
   */
  type?:
  | 'petrol'
  | 'fresh water'
  | 'greywater'
  | 'blackwater'
  | 'holding'
  | 'lpg'
  | 'diesel'
  | 'liveWell'
  | 'baitWell'
  | 'ballast'
  | 'rum'
  capacity?: FullValue<number>
  currentLevel?: FullValue<number>
  currentVolume?: FullValue<number>
  pressure?: FullValue<number>
  temperature?: FullValue<number>
  viscosity?: FullValue<number>
  extinguishant?: FullValue<string>
}

/**
 * Tank data, each tank identified by a unique name i.e. FreshWater_2
 */
export interface Tanks {
  /** Fresh water tank (drinking) */
  freshWater?: Record<string, Tank>

  /** Waste water tank (grey water) */
  wasteWater?: Record<string, Tank>

  /** Black water tank (sewage) */
  blackWater?: Record<string, Tank>

  /** Fuel tank (petrol or diesel) */
  fuel?: Record<string, Tank>

  /** Lubrication tank (oil or grease) */
  lubrication?: Record<string, Tank>

  /** Live tank (fish) */
  liveWell?: Record<string, Tank>

  /** Bait tank */
  baitWell?: Record<string, Tank>

  /** Lpg/propane and other gases */
  gas?: Record<string, Tank>

  /** Ballast tanks */
  ballast?: Record<string, Tank>
}
