/**
 * Communication data including Radio, Telephone, E-Mail, etc.
 */
export interface Communication {
  /**
   * Callsign for VHF communication
   */
  callsignVhf?: string
  /**
   * Callsign for HF communication
   */
  callsignHf?: string
  /**
   * Phone number of skipper
   */
  phoneNumber?: string
  /**
   * Email address to be used for HF email (Winmail, Airmail, Sailmail)
   */
  emailHf?: string
  /**
   * Regular email for the skipper
   */
  email?: string
  /**
   * Satellite phone number for vessel.
   */
  satPhoneNumber?: string
  /**
   * Full name of the skipper of the vessel.
   */
  skipperName?: string
  /**
   * Array with the names of the crew
   */
  crewNames?: [] | [string]
}
