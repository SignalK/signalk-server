import { Source } from './metadata'
import { MetaValue } from './metadata'
import { _AttrSchema } from './metadata'
import { Timestamp, FullValue } from './values'

/**
 * Sails data
 */
export interface Sails {
  /**
   * An object containing a description of each sail available to the vessel crew
   */
  inventory?: {
    /**
     * 'sail' data type.
     */
    [k: string]: {
      /**
       * An unique identifier by which the crew identifies a sail
       */
      name: string
      /**
       * The type of sail
       */
      type: string
      /**
       * The material the sail is made from (optional)
       */
      material?: string
      /**
       * The brand of the sail (optional)
       */
      brand?: string
      /**
       * Indicates wether this sail is currently in use or not
       */
      active: boolean
      /**
       * The total area of this sail in square meters
       */
      area: number
      /**
       * The minimum wind speed this sail can be used with
       */
      minimumWind?: number
      /**
       * The maximum wind speed this sail can be used with
       */
      maximumWind?: number
      /**
       * An object describing reduction of sail area
       */
      reducedState?: {
        /**
         * describes whether the sail is reduced or not
         */
        reduced?: boolean
        /**
         * Number of reefs set, 0 means full
         */
        reefs?: number
        /**
         * Ratio of sail reduction, 0 means full and 1 is completely furled in
         */
        furledRatio?: number
      }
      /**
       * RFC 3339 (UTC only without local offset) string representing date and time.
       */
      timestamp?: Timestamp
      source?: Source
      _attr?: _AttrSchema
      meta?: MetaValue
    }
  }
  /**
   * An object containing information about the vessels' sails.
   */
  area?: {
    total?: FullValue<number>
    active?: FullValue<number>
  }
}
