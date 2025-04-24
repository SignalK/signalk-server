import { Kilograms, Meters, Radians, Ratio } from './units'
import { CommonValueFields, FullValue } from './values'

/**
 * Design/dimensional data of this vessel
 */
export interface Design {
  displacement?: FullValue<Kilograms>
  /** The ais ship type see http://www.bosunsmate.org/ais/message5.php */
  aisShipType?: FullValue<AisShipType>
  /** The draft of the vessel */
  draft?: FullValue<{
    /** The minimum draft of the vessel */
    minimum?: Meters
    /** The maximum draft of the vessel */
    maximum?: Meters
    /** The current draft of the vessel */
    current?: Meters
    /** The draft of the vessel without protrusions such as keel, centerboard, rudder */
    canoe?: Meters
  }>
  /** The various lengths of the vessel */
  length?: FullValue<{
    /** Length overall */
    overall?: Meters
    /** Length of hull */
    hull: Meters
    /** Length at waterline */
    waterline?: Meters
  }>

  /** Information about the vessel's keel */
  keel?: {
    type?: KeelType
    /** A number indicating at which angle the keel currently is (in case of a canting keel), negative to port. */
    angle?: FullValue<Radians>
    /** In the case of a lifting keel, centreboard or daggerboard, the part of the keel which is extended. 0 is 'all the way up' and 1 is 'all the way down'. 0.8 would be 80% down. */
    lift: FullValue<Ratio>
  }
  beam?: FullValue<Meters>
  airHeight?: FullValue<Meters>

  /**
   * Information about the vessel's rigging
   */

  rigging?: CommonValueFields & {
    /** The configuration of the rigging */
    configuration: "string"

    /** The number of masts on the vessel. */
    masts: number
  }
}

export type AisShipType =
  | { id: 20, name: 'Wing In Ground' }
  | { id: 21, name: 'Wing In Ground hazard cat A' }
  | { id: 22, name: 'Wing In Ground hazard cat B' }
  | { id: 23, name: 'Wing In Ground hazard cat C' }
  | { id: 24, name: 'Wing In Ground hazard cat D' }
  | { id: 25, name: 'Wing In Ground' }
  | { id: 26, name: 'Wing In Ground' }
  | { id: 27, name: 'Wing In Ground' }
  | { id: 28, name: 'Wing In Ground' }
  | { id: 29, name: 'Wing In Ground (no other information)' }
  | { id: 30, name: 'Fishing' }
  | { id: 31, name: 'Towing' }
  | { id: 32, name: 'Towing exceeds 200m or wider than 25m' }
  | { id: 33, name: 'Engaged in dredging or underwater operations' }
  | { id: 34, name: 'Engaged in diving operations' }
  | { id: 35, name: 'Engaged in military operations' }
  | { id: 36, name: 'Sailing' }
  | { id: 37, name: 'Pleasure' }
  | { id: 40, name: 'High speed craft' }
  | { id: 41, name: 'High speed craft carrying dangerous goods' }
  | { id: 42, name: 'High speed craft hazard cat B' }
  | { id: 43, name: 'High speed craft hazard cat C' }
  | { id: 44, name: 'High speed craft hazard cat D' }
  | { id: 45, name: 'High speed craft' }
  | { id: 46, name: 'High speed craft' }
  | { id: 47, name: 'High speed craft' }
  | { id: 48, name: 'High speed craft' }
  | { id: 49, name: 'High speed craft (no additional information)' }
  | { id: 50, name: 'Pilot vessel' }
  | { id: 51, name: 'SAR' }
  | { id: 52, name: 'Tug' }
  | { id: 53, name: 'Port tender' }
  | { id: 54, name: 'Anti-pollution' }
  | { id: 55, name: 'Law enforcement' }
  | { id: 56, name: 'Spare' }
  | { id: 57, name: 'Spare #2' }
  | { id: 58, name: 'Medical' }
  | { id: 59, name: 'RR Resolution No.18' }
  | { id: 60, name: 'Passenger ship' }
  | { id: 61, name: 'Passenger ship hazard cat A' }
  | { id: 62, name: 'Passenger ship hazard cat B' }
  | { id: 63, name: 'Passenger ship hazard cat C' }
  | { id: 64, name: 'Passenger ship hazard cat D' }
  | { id: 65, name: 'Passenger ship' }
  | { id: 66, name: 'Passenger ship' }
  | { id: 67, name: 'Passenger ship' }
  | { id: 68, name: 'Passenger ship' }
  | { id: 69, name: 'Passenger ship (no additional information)' }
  | { id: 70, name: 'Cargo ship' }
  | { id: 71, name: 'Cargo ship carrying dangerous goods' }
  | { id: 72, name: 'Cargo ship hazard cat B' }
  | { id: 73, name: 'Cargo ship hazard cat C' }
  | { id: 74, name: 'Cargo ship hazard cat D' }
  | { id: 75, name: 'Cargo ship' }
  | { id: 76, name: 'Cargo ship' }
  | { id: 77, name: 'Cargo ship' }
  | { id: 78, name: 'Cargo ship' }
  | { id: 79, name: 'Cargo ship (no additional information)' }
  | { id: 80, name: 'Tanker' }
  | { id: 81, name: 'Tanker carrying dangerous goods' }
  | { id: 82, name: 'Tanker hazard cat B' }
  | { id: 83, name: 'Tanker hazard cat C' }
  | { id: 84, name: 'Tanker hazard cat D' }
  | { id: 85, name: 'Tanker' }
  | { id: 86, name: 'Tanker' }
  | { id: 87, name: 'Tanker' }
  | { id: 88, name: 'Tanker' }
  | { id: 89, name: 'Tanker (no additional information)' }
  | { id: 90, name: 'Other' }
  | { id: 91, name: 'Other carrying dangerous goods' }
  | { id: 92, name: 'Other hazard cat B' }
  | { id: 93, name: 'Other hazard cat C' }
  | { id: 94, name: 'Other hazard cat D' }
  | { id: 95, name: 'Other' }
  | { id: 96, name: 'Other' }
  | { id: 97, name: 'Other' }
  | { id: 98, name: 'Other' }
  | { id: 99, name: 'Other (no additional information)' }

/** The type of keel. */
export type KeelType =
  | "long"
  | "fin"
  | "flare"
  | "bulb"
  | "wing"
  | "centerboard"
  | "kanting"
  | "lifting"
  | "daggerboard"
