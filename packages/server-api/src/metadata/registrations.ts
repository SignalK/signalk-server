import type { PathMetadataEntry } from './types'

export const registrationsMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/registrations': {
    description: 'The various registrations of the vessel.'
  },
  '/vessels/*/registrations/imo': {
    description: 'The IMO number of the vessel.'
  },
  '/vessels/*/registrations/national': {
    description: 'The national registration number of the vessel.'
  },
  '/vessels/*/registrations/national/RegExp': {
    description:
      'This regex pattern is used for validating the identifier for the registration'
  },
  '/vessels/*/registrations/national/RegExp/country': {
    description: 'The ISO 3166-2 country code.'
  },
  '/vessels/*/registrations/national/RegExp/registration': {
    description: 'The registration code'
  },
  '/vessels/*/registrations/national/RegExp/description': {
    description: 'The registration description'
  },
  '/vessels/*/registrations/local': {
    description: 'A local or state registration number of the vessel.'
  },
  '/vessels/*/registrations/local/RegExp': {
    description:
      'This regex pattern is used for validating the identifier for the registration'
  },
  '/vessels/*/registrations/local/RegExp/registration': {
    description: 'The registration code'
  },
  '/vessels/*/registrations/local/RegExp/description': {
    description: 'The registration description'
  },
  '/vessels/*/registrations/other': {
    description: 'Other registration or permits for the vessel.'
  },
  '/vessels/*/registrations/other/RegExp': {
    description:
      'This regex pattern is used for validating the identifier for the registration'
  },
  '/vessels/*/registrations/other/RegExp/registration': {
    description: 'The registration code'
  },
  '/vessels/*/registrations/other/RegExp/description': {
    description: 'The registration description'
  }
}
