import { MID } from './mid'

export type MMSISourceType =
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

/** @category MMSI */
export interface MMSIInfo {
  /** Maritime identifier */
  mid: number
  /** Mobile station identifier */
  msi: number
  /** Source type */
  type?: MMSISourceType
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
export const parseMmsi = (mmsi: string): MMSIInfo | null => {
  if (typeof mmsi !== 'string') {
    return null
  }
  let info: MMSIInfo
  try {
    if (mmsi.startsWith('00')) {
      // coast station
      info = {
        mid: parseInt(mmsi.slice(2, 5)),
        msi: parseInt(mmsi.slice(5)),
        type: 'coastalStation'
      }
    } else if (mmsi.startsWith('0')) {
      // Group of ships
      info = {
        mid: parseInt(mmsi.slice(1, 4)),
        msi: parseInt(mmsi.slice(4)),
        type: 'group'
      }
    } else if (mmsi.startsWith('99')) {
      // AtoN
      info = {
        mid: parseInt(mmsi.slice(2, 5)),
        msi: parseInt(mmsi.slice(5)),
        type: 'aton'
      }
    } else if (mmsi.startsWith('98')) {
      // Aux craft associated with parent ship
      info = {
        mid: parseInt(mmsi.slice(2, 5)),
        msi: parseInt(mmsi.slice(5)),
        type: 'auxiliaryCraft'
      }
    } else if (mmsi.startsWith('970')) {
      // SART transmitter
      info = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'sart'
      }
    } else if (mmsi.startsWith('972')) {
      // MOB device
      info = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'mobDevice'
      }
    } else if (mmsi.startsWith('974')) {
      // EPIRB
      info = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'epirb'
      }
    } else if (mmsi.startsWith('8')) {
      // diver
      info = {
        mid: parseInt(mmsi.slice(1, 4)),
        msi: parseInt(mmsi.slice(4)),
        type: 'diverRadio'
      }
    } else if (mmsi.startsWith('111')) {
      // SaR
      info = {
        mid: parseInt(mmsi.slice(3, 6)),
        msi: parseInt(mmsi.slice(6)),
        type: 'sarAircraft'
      }
    } else {
      // ship
      info = {
        mid: parseInt(mmsi.slice(0, 3)),
        msi: parseInt(mmsi.slice(3)),
        type: 'ship'
      }
    }
    if (MID[info.mid]) {
      info.flag = MID[info.mid][0]
    }
    return info
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
