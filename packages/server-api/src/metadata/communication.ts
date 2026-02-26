import type { PathMetadataEntry } from './types'

export const communicationMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/communication': {
    description: 'Communication data including Radio, Telephone, E-Mail, etc.'
  },
  '/vessels/*/communication/callsignVhf': {
    description: 'Callsign for VHF communication'
  },
  '/vessels/*/communication/callsignHf': {
    description: 'Callsign for HF communication'
  },
  '/vessels/*/communication/phoneNumber': {
    description: 'Phone number of skipper'
  },
  '/vessels/*/communication/emailHf': {
    description:
      'Email address to be used for HF email (Winmail, Airmail, Sailmail)'
  },
  '/vessels/*/communication/email': {
    description: 'Regular email for the skipper'
  },
  '/vessels/*/communication/satPhoneNumber': {
    description: 'Satellite phone number for vessel.'
  },
  '/vessels/*/communication/skipperName': {
    description: 'Full name of the skipper of the vessel.'
  },
  '/vessels/*/communication/crewNames': {
    description: 'Array with the names of the crew'
  }
}
