import type { PathMetadataEntry } from './types'

// Allowed liquid types across every tank category. Keeping a single
// constant means a future protocol change to the list can't drift between
// freshWater / wasteWater / blackWater / fuel / lubrication / liveWell /
// baitWell / gas / ballast.
const TANK_TYPE_ENUM = [
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
] as const

export const tanksMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/tanks': {
    description:
      'Tank data, each tank identified by a unique name i.e. FreshWater_2'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/freshWater/RegExp/capacity': {
    description: 'Total volume of the fresh water tank when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/freshWater/RegExp/currentLevel': {
    description:
      'Level of fluid in the fresh water tank as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/freshWater/RegExp/currentVolume': {
    description: 'Volume of fluid currently in the fresh water tank.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/wasteWater/RegExp/capacity': {
    description: 'Total volume of the waste (grey) water tank when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/wasteWater/RegExp/currentLevel': {
    description:
      'Level of fluid in the waste (grey) water tank as a ratio of its capacity, from empty to full. Also called the grey water tank.',
    units: 'ratio'
  },
  '/vessels/*/tanks/wasteWater/RegExp/currentVolume': {
    description: 'Volume of fluid currently in the waste (grey) water tank.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/blackWater/RegExp/capacity': {
    description: 'Total volume of the black water (sewage) tank when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/blackWater/RegExp/currentLevel': {
    description:
      'Level of fluid in the black water (sewage) tank as a ratio of its capacity, from empty to full. Also called the holding tank.',
    units: 'ratio'
  },
  '/vessels/*/tanks/blackWater/RegExp/currentVolume': {
    description: 'Volume of fluid currently in the black water (sewage) tank.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/fuel/RegExp/capacity': {
    description: 'Total volume of the fuel tank when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/fuel/RegExp/currentLevel': {
    description:
      'Level of fluid in the fuel tank as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/fuel/RegExp/currentVolume': {
    description: 'Volume of fluid currently in the fuel tank.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/lubrication/RegExp/capacity': {
    description:
      'Total volume of the lubricant tank (oil reservoir) when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/lubrication/RegExp/currentLevel': {
    description:
      'Level of the lubricant tank (oil reservoir) as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/lubrication/RegExp/currentVolume': {
    description:
      'Volume of lubricant currently in the lubricant tank (oil reservoir).',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/liveWell/RegExp/capacity': {
    description:
      'Total volume of the livewell when full: the tank that keeps caught fish alive in oxygenated water.',
    units: 'm3'
  },
  '/vessels/*/tanks/liveWell/RegExp/currentLevel': {
    description:
      'Level of water in the livewell, the tank that keeps caught fish alive, as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/liveWell/RegExp/currentVolume': {
    description:
      'Volume of water currently in the livewell, the tank that keeps caught fish alive.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/baitWell/RegExp/capacity': {
    description:
      'Total volume of the baitwell when full: the tank that keeps live bait, such as shrimp or small fish, alive.',
    units: 'm3'
  },
  '/vessels/*/tanks/baitWell/RegExp/currentLevel': {
    description:
      'Level of water in the baitwell, the tank that keeps live bait alive, as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/baitWell/RegExp/currentVolume': {
    description:
      'Volume of water currently in the baitwell, the tank that keeps live bait alive.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/gas/RegExp/capacity': {
    description: 'Total volume of the gas tank when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/gas/RegExp/currentLevel': {
    description:
      'Level of fluid in the gas tank as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/gas/RegExp/currentVolume': {
    description: 'Volume of fluid currently in the gas tank.',
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
    units: 'Pa.s'
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
    enum: [...TANK_TYPE_ENUM]
  },
  '/vessels/*/tanks/ballast/RegExp/capacity': {
    description: 'Total volume of the ballast tank when full.',
    units: 'm3'
  },
  '/vessels/*/tanks/ballast/RegExp/currentLevel': {
    description:
      'Level of fluid in the ballast tank as a ratio of its capacity, from empty to full.',
    units: 'ratio'
  },
  '/vessels/*/tanks/ballast/RegExp/currentVolume': {
    description: 'Volume of fluid currently in the ballast tank.',
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
    units: 'Pa.s'
  },
  '/vessels/*/tanks/ballast/RegExp/extinguishant': {
    description: 'The preferred extinguishant to douse a fire in this tank'
  }
}
