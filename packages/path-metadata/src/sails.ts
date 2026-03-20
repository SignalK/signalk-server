import type { PathMetadataEntry } from './types'

export const sailsMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/sails': {
    description: 'Sails data'
  },
  '/vessels/*/sails/inventory': {
    description:
      'An object containing a description of each sail available to the vessel crew'
  },
  '/vessels/*/sails/inventory/RegExp': {
    description: "'sail' data type."
  },
  '/vessels/*/sails/inventory/RegExp/name': {
    description: 'An unique identifier by which the crew identifies a sail'
  },
  '/vessels/*/sails/inventory/RegExp/type': {
    description: 'The type of sail'
  },
  '/vessels/*/sails/inventory/RegExp/material': {
    description: 'The material the sail is made from (optional)'
  },
  '/vessels/*/sails/inventory/RegExp/brand': {
    description: 'The brand of the sail (optional)'
  },
  '/vessels/*/sails/inventory/RegExp/active': {
    description: 'Indicates wether this sail is currently in use or not'
  },
  '/vessels/*/sails/inventory/RegExp/area': {
    description: 'The total area of this sail in square meters',
    units: 'm2'
  },
  '/vessels/*/sails/inventory/RegExp/minimumWind': {
    description: 'The minimum wind speed this sail can be used with',
    units: 'm/s'
  },
  '/vessels/*/sails/inventory/RegExp/maximumWind': {
    description: 'The maximum wind speed this sail can be used with',
    units: 'm/s'
  },
  '/vessels/*/sails/inventory/RegExp/reducedState': {
    description: 'An object describing reduction of sail area'
  },
  '/vessels/*/sails/inventory/RegExp/reducedState/reduced': {
    description: 'describes whether the sail is reduced or not'
  },
  '/vessels/*/sails/inventory/RegExp/reducedState/reefs': {
    description: 'Number of reefs set, 0 means full'
  },
  '/vessels/*/sails/inventory/RegExp/reducedState/furledRatio': {
    description:
      'Ratio of sail reduction, 0 means full and 1 is completely furled in'
  },
  '/vessels/*/sails/area': {
    description: "An object containing information about the vessels' sails."
  },
  '/vessels/*/sails/area/total': {
    description: 'Data should be of type number.',
    units: 'm2'
  },
  '/vessels/*/sails/area/active': {
    description: 'Data should be of type number.',
    units: 'm2'
  }
}
