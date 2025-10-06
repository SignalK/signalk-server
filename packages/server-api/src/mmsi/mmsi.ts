import { MID } from './mid'
/** @category MMSI */
export interface MmsiDef {
  /** Maritime identifier */
  mid: number
  /** Mobile station identifier */
  msi: number
  /** Source type */
  type?:
    | 'ship'
    | 'coastalStation'
    | 'group'
    | 'aton'
    | 'auxiliaryCraft'
    | 'sart'
    | 'sarAircraft'
    | 'mobDevice'
    | 'epirb'
    | 'diverRadio'
  /** Two character country code */
  flag?: string
}

/**
 * Parse the supplied MMSI value into object containing mid, msi, type and flag.
 *
 * @example
 * ```javascript
 * app.parseMmsi('201456789')
 *
 * returns: {
 *   mid: 201,
 *   msi: 456789,
 *   type: 'ship',
 *   flag: 'AL'
 * }
 * ```
 *
 * @param mmsi - MMSI.
 *
 * @category MMSI
 */
export const parseMmsi = (mmsi: string): MmsiDef | null => {
  if (typeof mmsi !== 'string') {
    return null
  }
  let def: MmsiDef
  try {
    if (mmsi.startsWith('00')) {
      // coast station
      def = {
        mid: parseInt(mmsi.slice(2, 5)),
        msi: parseInt(mmsi.slice(5)),
        type: 'coastalStation'
      }
    } else if (mmsi.startsWith('0')) {
      // Group of ships
      def = {
        mid: parseInt(mmsi.slice(1, 4)),
        msi: parseInt(mmsi.slice(4)),
        type: 'group'
      }
    } else if (mmsi.startsWith('99')) {
      // AtoN
      def = {
        mid: parseInt(mmsi.slice(2, 5)),
        msi: parseInt(mmsi.slice(5)),
        type: 'aton'
      }
    } else if (mmsi.startsWith('98')) {
      // Aux craft associated with parent ship
      def = {
        mid: parseInt(mmsi.slice(2, 5)),
        msi: parseInt(mmsi.slice(5)),
        type: 'auxiliaryCraft'
      }
    } else if (mmsi.startsWith('970')) {
      // SART transmitter
      def = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'sart'
      }
    } else if (mmsi.startsWith('972')) {
      // MOB device
      def = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'mobDevice'
      }
    } else if (mmsi.startsWith('974')) {
      // EPIRB
      def = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'epirb'
      }
    } else if (mmsi.startsWith('8')) {
      // diver
      def = {
        mid: parseInt(mmsi.slice(1, 4)),
        msi: parseInt(mmsi.slice(4)),
        type: 'diverRadio'
      }
    } else if (mmsi.startsWith('111')) {
      // SaR
      def = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'sarAircraft'
      }
    } else {
      // ship
      def = {
        mid: parseInt(mmsi.slice(0, 3)),
        msi: parseInt(mmsi.slice(3)),
        type: 'ship'
      }
    }
    if (MID[def.mid]) {
      def.flag = MID[def.mid][0]
    }
    return def
  } catch {
    return null
  }
}

/**
 * Return the two letter country code for the MID from the supplied MMSI.
 *
 * @example
 * ```javascript
 * app.getFlag('201456789')

* returns: 'AL'
* ```
*
* @param mmsi - MMSI.
* @returns Two letter country code.
*
* @category MMSI
*/
export const getFlag = (mmsi: string): string | null => {
  const m = parseMmsi(mmsi)
  return m?.flag ?? null
}
