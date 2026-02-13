import type { PathMetadataEntry } from './types'

export const tanksMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/tanks': {
    description:
      'Tank data, each tank indentified by a unique name i.e. FreshWater_2'
  },
  '/vessels/*/tanks/freshWater': {
    description: 'Fresh water tank (drinking)'
  },
  '/vessels/*/tanks/freshWater/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/freshWater/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/freshWater/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/freshWater/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/freshWater/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/freshWater/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/freshWater/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/freshWater/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/freshWater/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/freshWater/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/wasteWater': {
    description: 'Waste water tank (grey water)'
  },
  '/vessels/*/tanks/wasteWater/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/wasteWater/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/wasteWater/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/wasteWater/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/wasteWater/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/wasteWater/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/wasteWater/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/wasteWater/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/wasteWater/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/wasteWater/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/blackWater': {
    description: 'Black water tank (sewage)'
  },
  '/vessels/*/tanks/blackWater/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/blackWater/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/blackWater/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/blackWater/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/blackWater/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/blackWater/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/blackWater/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/blackWater/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/blackWater/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/blackWater/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/fuel': {
    description: 'Fuel tank (petrol or diesel)'
  },
  '/vessels/*/tanks/fuel/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/fuel/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/fuel/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/fuel/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/fuel/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/fuel/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/fuel/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/fuel/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/fuel/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/fuel/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/lubrication': {
    description: 'Lubrication tank (oil or grease)'
  },
  '/vessels/*/tanks/lubrication/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/lubrication/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/lubrication/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/lubrication/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/lubrication/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/lubrication/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/lubrication/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/lubrication/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/lubrication/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/lubrication/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/liveWell': {
    description: 'Live tank (fish)'
  },
  '/vessels/*/tanks/liveWell/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/liveWell/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/liveWell/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/liveWell/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/liveWell/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/liveWell/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/liveWell/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/liveWell/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/liveWell/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/liveWell/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/baitWell': {
    description: 'Bait tank'
  },
  '/vessels/*/tanks/baitWell/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/baitWell/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/baitWell/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/baitWell/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/baitWell/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/baitWell/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/baitWell/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/baitWell/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/baitWell/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/baitWell/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/gas': {
    description: 'Lpg/propane and other gases'
  },
  '/vessels/*/tanks/gas/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/gas/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/gas/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/gas/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/gas/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/gas/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/gas/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/gas/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/gas/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/gas/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  },
  '/vessels/*/tanks/ballast': {
    description: 'Ballast tanks'
  },
  '/vessels/*/tanks/ballast/RegExp': {
    description: 'Tank, one or many, within the vessel'
  },
  '/vessels/*/tanks/ballast/RegExp/name': {
    description:
      'The name of the tank. Useful if multiple tanks of a certain type are on board'
  },
  '/vessels/*/tanks/ballast/RegExp/type': {
    description: 'The type of tank',
    enum: [
      'petrol',
      'fresh water',
      'greywater',
      'blackwater',
      'holding',
      'lpg',
      'diesel',
      'liveWell',
      'baitWell',
      'ballast',
      'rum'
    ]
  },
  '/vessels/*/tanks/ballast/RegExp/capacity': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/ballast/RegExp/currentLevel': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/tanks/ballast/RegExp/currentVolume': {
    description: 'Data should be of type number.',
    units: 'm3'
  },
  '/vessels/*/tanks/ballast/RegExp/pressure': {
    description: 'Data should be of type number.',
    units: 'Pa'
  },
  '/vessels/*/tanks/ballast/RegExp/temperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/tanks/ballast/RegExp/viscosity': {
    description: 'Data should be of type number.',
    units: 'Pa/s'
  },
  '/vessels/*/tanks/ballast/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  }
}
