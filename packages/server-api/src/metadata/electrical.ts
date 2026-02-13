import type { PathMetadataEntry } from './types'

export const electricalMetadata: Record<string, PathMetadataEntry> = {
  '/vessels/*/electrical': {
    description:
      'Electrical data, each electrical device indentified by a unique name i.e. Battery_1'
  },
  '/vessels/*/electrical/batteries': {
    description: "Data about the vessel's batteries"
  },
  '/vessels/*/electrical/batteries/RegExp': {
    description: 'Batteries, one or many, within the vessel'
  },
  '/vessels/*/electrical/batteries/RegExp/name': {
    description:
      'Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.)'
  },
  '/vessels/*/electrical/batteries/RegExp/location': {
    description: 'Installed location of device on vessel'
  },
  '/vessels/*/electrical/batteries/RegExp/dateInstalled': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/electrical/batteries/RegExp/manufacturer': {
    description: '[missing]'
  },
  '/vessels/*/electrical/batteries/RegExp/manufacturer/name': {
    description: "Manufacturer's name"
  },
  '/vessels/*/electrical/batteries/RegExp/manufacturer/model': {
    description: 'Model or part number'
  },
  '/vessels/*/electrical/batteries/RegExp/manufacturer/URL': {
    description: 'Web referance / URL'
  },
  '/vessels/*/electrical/batteries/RegExp/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/batteries/RegExp/voltage': {
    description: 'Voltage measured at or as close as possible to the device',
    units: 'V'
  },
  '/vessels/*/electrical/batteries/RegExp/voltage/ripple': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/batteries/RegExp/current': {
    description:
      'Current flowing out (+ve) or in (-ve) to the device. Reversed for batteries (+ve = charging).',
    units: 'A'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature': {
    description: 'Temperature measured within or on the device',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/warnUpper': {
    description: 'Upper operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/warnLower': {
    description: 'Lower operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/faultUpper': {
    description:
      'Upper fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/faultLower': {
    description:
      'Lower fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/limitDischargeLower': {
    description: 'Operational minimum temperature limit for battery discharge',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/limitDischargeUpper': {
    description: 'Operational maximum temperature limit for battery discharge',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/limitRechargeLower': {
    description: 'Operational minimum temperature limit for battery recharging',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/temperature/limitRechargeUpper': {
    description: 'Operational maximum temperature limit for battery recharging',
    units: 'K'
  },
  '/vessels/*/electrical/batteries/RegExp/chemistry': {
    description: 'Type of battery FLA, LiFePO4, etc.'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity': {
    description: "Data about the battery's capacity"
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/nominal': {
    description: 'The capacity of battery as specified by the manufacturer',
    units: 'J'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/actual': {
    description:
      'The measured capacity of battery. This may change over time and will likely deviate from the nominal capacity.',
    units: 'J'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/remaining': {
    description: 'Capacity remaining in battery',
    units: 'J'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/dischargeLimit': {
    description: 'Minimum capacity to be left in the battery while discharging',
    units: 'J'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/stateOfCharge': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/stateOfHealth': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/dischargeSinceFull': {
    description: 'Data should be of type number.',
    units: 'C'
  },
  '/vessels/*/electrical/batteries/RegExp/capacity/timeRemaining': {
    description: 'Data should be of type number.',
    units: 's'
  },
  '/vessels/*/electrical/batteries/RegExp/lifetimeDischarge': {
    description:
      'Cumulative charge discharged from battery over operational lifetime of battery',
    units: 'C'
  },
  '/vessels/*/electrical/batteries/RegExp/lifetimeRecharge': {
    description:
      'Cumulative charge recharged into battery over operational lifetime of battery',
    units: 'C'
  },
  '/vessels/*/electrical/inverters': {
    description: 'Data about the Inverter that has both DC and AC qualities'
  },
  '/vessels/*/electrical/inverters/RegExp': {
    description: 'DC to AC inverter, one or many, within the vessel'
  },
  '/vessels/*/electrical/inverters/RegExp/name': {
    description:
      'Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.)'
  },
  '/vessels/*/electrical/inverters/RegExp/location': {
    description: 'Installed location of device on vessel'
  },
  '/vessels/*/electrical/inverters/RegExp/dateInstalled': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/electrical/inverters/RegExp/manufacturer': {
    description: '[missing]'
  },
  '/vessels/*/electrical/inverters/RegExp/manufacturer/name': {
    description: "Manufacturer's name"
  },
  '/vessels/*/electrical/inverters/RegExp/manufacturer/model': {
    description: 'Model or part number'
  },
  '/vessels/*/electrical/inverters/RegExp/manufacturer/URL': {
    description: 'Web referance / URL'
  },
  '/vessels/*/electrical/inverters/RegExp/dc': {
    description: 'DC common qualities'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/voltage': {
    description: 'Voltage measured at or as close as possible to the device',
    units: 'V'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/voltage/ripple': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/current': {
    description:
      'Current flowing out (+ve) or in (-ve) to the device. Reversed for batteries (+ve = charging).',
    units: 'A'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/temperature': {
    description: 'Temperature measured within or on the device',
    units: 'K'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/temperature/warnUpper': {
    description: 'Upper operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/temperature/warnLower': {
    description: 'Lower operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/temperature/faultUpper': {
    description:
      'Upper fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/inverters/RegExp/dc/temperature/faultLower': {
    description:
      'Lower fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/inverters/RegExp/ac': {
    description: 'AC equipment common qualities'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/lineNeutralVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/lineLineVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/current': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/frequency': {
    description: 'Data should be of type number.',
    units: 'Hz'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/reactivePower': {
    description: 'Data should be of type number.',
    units: 'W'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/powerFactor': {
    description: 'Data should be of type number.'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/powerFactorLagging': {
    description: 'Lead/lag status.',
    enum: ['leading', 'lagging', 'error', 'not available']
  },
  '/vessels/*/electrical/inverters/RegExp/ac/realPower': {
    description: 'Data should be of type number.',
    units: 'W'
  },
  '/vessels/*/electrical/inverters/RegExp/ac/apparentPower': {
    description: 'Data should be of type number.',
    units: 'W'
  },
  '/vessels/*/electrical/inverters/RegExp/inverterMode': {
    description: 'Mode of inverter'
  },
  '/vessels/*/electrical/chargers': {
    description: 'Data about AC sourced battery charger'
  },
  '/vessels/*/electrical/chargers/RegExp': {
    description: 'Battery charger'
  },
  '/vessels/*/electrical/chargers/RegExp/name': {
    description:
      'Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.)'
  },
  '/vessels/*/electrical/chargers/RegExp/location': {
    description: 'Installed location of device on vessel'
  },
  '/vessels/*/electrical/chargers/RegExp/dateInstalled': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/electrical/chargers/RegExp/manufacturer': {
    description: '[missing]'
  },
  '/vessels/*/electrical/chargers/RegExp/manufacturer/name': {
    description: "Manufacturer's name"
  },
  '/vessels/*/electrical/chargers/RegExp/manufacturer/model': {
    description: 'Model or part number'
  },
  '/vessels/*/electrical/chargers/RegExp/manufacturer/URL': {
    description: 'Web referance / URL'
  },
  '/vessels/*/electrical/chargers/RegExp/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/chargers/RegExp/voltage': {
    description: 'Voltage measured at or as close as possible to the device',
    units: 'V'
  },
  '/vessels/*/electrical/chargers/RegExp/voltage/ripple': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/chargers/RegExp/current': {
    description:
      'Current flowing out (+ve) or in (-ve) to the device. Reversed for batteries (+ve = charging).',
    units: 'A'
  },
  '/vessels/*/electrical/chargers/RegExp/temperature': {
    description: 'Temperature measured within or on the device',
    units: 'K'
  },
  '/vessels/*/electrical/chargers/RegExp/temperature/warnUpper': {
    description: 'Upper operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/chargers/RegExp/temperature/warnLower': {
    description: 'Lower operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/chargers/RegExp/temperature/faultUpper': {
    description:
      'Upper fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/chargers/RegExp/temperature/faultLower': {
    description:
      'Lower fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/chargers/RegExp/chargingAlgorithm': {
    description: 'Algorithm being used by the charger'
  },
  '/vessels/*/electrical/chargers/RegExp/chargerRole': {
    description:
      'How is charging source configured?  Standalone, or in sync with another charger?'
  },
  '/vessels/*/electrical/chargers/RegExp/chargingMode': {
    description: 'Charging mode i.e. float, overcharge, etc.'
  },
  '/vessels/*/electrical/chargers/RegExp/setpointVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/chargers/RegExp/setpointCurrent': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/alternators': {
    description: 'Data about an Alternator charging device'
  },
  '/vessels/*/electrical/alternators/RegExp': {
    description: 'Mechanically driven alternator, includes dynamos'
  },
  '/vessels/*/electrical/alternators/RegExp/name': {
    description:
      'Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.)'
  },
  '/vessels/*/electrical/alternators/RegExp/location': {
    description: 'Installed location of device on vessel'
  },
  '/vessels/*/electrical/alternators/RegExp/dateInstalled': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/electrical/alternators/RegExp/manufacturer': {
    description: '[missing]'
  },
  '/vessels/*/electrical/alternators/RegExp/manufacturer/name': {
    description: "Manufacturer's name"
  },
  '/vessels/*/electrical/alternators/RegExp/manufacturer/model': {
    description: 'Model or part number'
  },
  '/vessels/*/electrical/alternators/RegExp/manufacturer/URL': {
    description: 'Web referance / URL'
  },
  '/vessels/*/electrical/alternators/RegExp/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/alternators/RegExp/voltage': {
    description: 'Voltage measured at or as close as possible to the device',
    units: 'V'
  },
  '/vessels/*/electrical/alternators/RegExp/voltage/ripple': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/alternators/RegExp/current': {
    description:
      'Current flowing out (+ve) or in (-ve) to the device. Reversed for batteries (+ve = charging).',
    units: 'A'
  },
  '/vessels/*/electrical/alternators/RegExp/temperature': {
    description: 'Temperature measured within or on the device',
    units: 'K'
  },
  '/vessels/*/electrical/alternators/RegExp/temperature/warnUpper': {
    description: 'Upper operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/alternators/RegExp/temperature/warnLower': {
    description: 'Lower operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/alternators/RegExp/temperature/faultUpper': {
    description:
      'Upper fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/alternators/RegExp/temperature/faultLower': {
    description:
      'Lower fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/alternators/RegExp/chargingAlgorithm': {
    description: 'Algorithm being used by the charger'
  },
  '/vessels/*/electrical/alternators/RegExp/chargerRole': {
    description:
      'How is charging source configured?  Standalone, or in sync with another charger?'
  },
  '/vessels/*/electrical/alternators/RegExp/chargingMode': {
    description: 'Charging mode i.e. float, overcharge, etc.'
  },
  '/vessels/*/electrical/alternators/RegExp/setpointVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/alternators/RegExp/setpointCurrent': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/alternators/RegExp/revolutions': {
    description: 'Data should be of type number.',
    units: 'Hz'
  },
  '/vessels/*/electrical/alternators/RegExp/pulleyRatio': {
    description: 'Data should be of type number.',
    units: 'ratio'
  },
  '/vessels/*/electrical/alternators/RegExp/fieldDrive': {
    description: 'Data should be of type number.',
    units: '%'
  },
  '/vessels/*/electrical/alternators/RegExp/regulatorTemperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/electrical/solar': {
    description: 'Data about Solar charging device(s)'
  },
  '/vessels/*/electrical/solar/RegExp': {
    description: 'Photovoltaic charging devices'
  },
  '/vessels/*/electrical/solar/RegExp/name': {
    description:
      'Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.)'
  },
  '/vessels/*/electrical/solar/RegExp/location': {
    description: 'Installed location of device on vessel'
  },
  '/vessels/*/electrical/solar/RegExp/dateInstalled': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/electrical/solar/RegExp/manufacturer': {
    description: '[missing]'
  },
  '/vessels/*/electrical/solar/RegExp/manufacturer/name': {
    description: "Manufacturer's name"
  },
  '/vessels/*/electrical/solar/RegExp/manufacturer/model': {
    description: 'Model or part number'
  },
  '/vessels/*/electrical/solar/RegExp/manufacturer/URL': {
    description: 'Web referance / URL'
  },
  '/vessels/*/electrical/solar/RegExp/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/solar/RegExp/voltage': {
    description: 'Voltage measured at or as close as possible to the device',
    units: 'V'
  },
  '/vessels/*/electrical/solar/RegExp/voltage/ripple': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/solar/RegExp/current': {
    description:
      'Current flowing out (+ve) or in (-ve) to the device. Reversed for batteries (+ve = charging).',
    units: 'A'
  },
  '/vessels/*/electrical/solar/RegExp/temperature': {
    description: 'Temperature measured within or on the device',
    units: 'K'
  },
  '/vessels/*/electrical/solar/RegExp/temperature/warnUpper': {
    description: 'Upper operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/solar/RegExp/temperature/warnLower': {
    description: 'Lower operational temperature limit',
    units: 'K'
  },
  '/vessels/*/electrical/solar/RegExp/temperature/faultUpper': {
    description:
      'Upper fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/solar/RegExp/temperature/faultLower': {
    description:
      'Lower fault temperature limit - device may disable/disconnect',
    units: 'K'
  },
  '/vessels/*/electrical/solar/RegExp/chargingAlgorithm': {
    description: 'Algorithm being used by the charger'
  },
  '/vessels/*/electrical/solar/RegExp/chargerRole': {
    description:
      'How is charging source configured?  Standalone, or in sync with another charger?'
  },
  '/vessels/*/electrical/solar/RegExp/chargingMode': {
    description: 'Charging mode i.e. float, overcharge, etc.'
  },
  '/vessels/*/electrical/solar/RegExp/setpointVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/solar/RegExp/setpointCurrent': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/solar/RegExp/controllerMode': {
    description: 'The current state of the engine'
  },
  '/vessels/*/electrical/solar/RegExp/panelVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/solar/RegExp/panelCurrent': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/solar/RegExp/panelPower': {
    description: 'Data should be of type number.',
    units: 'W'
  },
  '/vessels/*/electrical/solar/RegExp/panelTemperature': {
    description: 'Data should be of type number.',
    units: 'K'
  },
  '/vessels/*/electrical/solar/RegExp/yieldToday': {
    description: 'Data should be of type number.',
    units: 'J'
  },
  '/vessels/*/electrical/solar/RegExp/load': {
    description: 'State of load port on controller (if applicable)'
  },
  '/vessels/*/electrical/solar/RegExp/loadCurrent': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/ac': {
    description: 'AC buses'
  },
  '/vessels/*/electrical/ac/RegExp': {
    description: 'AC Bus, one or many, within the vessel'
  },
  '/vessels/*/electrical/ac/RegExp/name': {
    description:
      'Unique ID of device (houseBattery, alternator, Generator, solar1, inverter, charger, combiner, etc.)'
  },
  '/vessels/*/electrical/ac/RegExp/location': {
    description: 'Installed location of device on vessel'
  },
  '/vessels/*/electrical/ac/RegExp/dateInstalled': {
    description:
      'RFC 3339 (UTC only without local offset) string representing date and time.',
    units: 'RFC 3339 (UTC)'
  },
  '/vessels/*/electrical/ac/RegExp/manufacturer': {
    description: '[missing]'
  },
  '/vessels/*/electrical/ac/RegExp/manufacturer/name': {
    description: "Manufacturer's name"
  },
  '/vessels/*/electrical/ac/RegExp/manufacturer/model': {
    description: 'Model or part number'
  },
  '/vessels/*/electrical/ac/RegExp/manufacturer/URL': {
    description: 'Web referance / URL'
  },
  '/vessels/*/electrical/ac/RegExp/phase': {
    description: 'Single or A,B or C in 3 Phase systems '
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])': {
    description: 'AC equipment common qualities'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/associatedBus': {
    description: 'Name of BUS device is associated with'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/lineNeutralVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/lineLineVoltage': {
    description: 'Data should be of type number.',
    units: 'V'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/current': {
    description: 'Data should be of type number.',
    units: 'A'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/frequency': {
    description: 'Data should be of type number.',
    units: 'Hz'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/reactivePower': {
    description: 'Data should be of type number.',
    units: 'W'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/powerFactor': {
    description: 'Data should be of type number.'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/powerFactorLagging': {
    description: 'Lead/lag status.',
    enum: ['leading', 'lagging', 'error', 'not available']
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/realPower': {
    description: 'Data should be of type number.',
    units: 'W'
  },
  '/vessels/*/electrical/ac/RegExp/phase/(single)|([A-C])/apparentPower': {
    description: 'Data should be of type number.',
    units: 'W'
  }
}
