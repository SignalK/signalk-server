
export interface UnitConversion {
  formula: string
  inverseFormula: string
  symbol: string
  longName?: string
  key?: string
  convert:  
    | ((value: number) => number)
    | ((value: number) => string)
    | ((value: string) => string)
    | ((value: boolean) => boolean)
}

export interface UnitConversions {
  longName: string
  conversions: {
    [key: UnitId]: UnitConversion
  }
}

export interface Conversions {
  [key: UnitId]: UnitConversions
}

const STANDARD_CONVERSIONS: Conversions = {
  'm/s': {
    longName: 'meters per second',
    conversions: {
      kn: {
        formula: 'value * 1.94384',
        inverseFormula: 'value * 0.514444',
        symbol: 'kn',
        longName: 'knots',
        convert: (value: number) => value * 1.94384
      },
      'km/h': {
        formula: 'value * 3.6',
        inverseFormula: 'value * 0.277778',
        symbol: 'km/h',
        longName: 'kilometers per hour',
        convert: (value: number) => value * 3.6
      },
      mph: {
        formula: 'value * 2.2369362920544025',
        inverseFormula: 'value / 2.2369362920544025',
        symbol: 'mph',
        longName: 'miles per hour',
        convert: (value: number) => value * 2.2369362920544025
      },
      Bf: {
        formula: '(value / 0.836)^(2/3)',
        inverseFormula: '0.836 * value^1.5',
        symbol: 'Bf',
        longName: 'Beaufort',
        convert: (value: number) => Math.pow(value / 0.836, 2 / 3)
      },
      fps: {
        formula: 'value * 3.280839895013124',
        inverseFormula: 'value / 3.280839895013124',
        symbol: 'fps',
        convert: (value: number) => value * 3.280839895013124
      },
      knot: {
        formula: 'value * 1.943844494119952',
        inverseFormula: 'value / 1.943844494119952',
        symbol: 'knot',
        convert: (value: number) => value * 1.943844494119952
      },
      kph: {
        formula: 'value * 3.5999999971200007',
        inverseFormula: 'value / 3.5999999971200007',
        symbol: 'kph',
        convert: (value: number) => value * 3.5999999971200007
      }
    }
  },
  K: {
    longName: 'kelvin',
    conversions: {
      C: {
        formula: 'value - 273.15',
        inverseFormula: 'value + 273.15',
        symbol: '°C',
        longName: 'celsius',
        key: 'C',
        convert: (value: number) => value - 273.15
      },
      F: {
        formula: '(value - 273.15) * 9/5 + 32',
        inverseFormula: '(value - 32) * 5/9 + 273.15',
        symbol: '°F',
        longName: 'fahrenheit',
        key: 'F',
        convert: (value: number) => ((value - 273.15) * 9) / 5 + 32
      }
    }
  },
  Pa: {
    longName: 'pascal',
    conversions: {
      hPa: {
        formula: 'value * 0.01',
        inverseFormula: 'value * 100',
        symbol: 'hPa',
        longName: 'hectopascal',
        convert: (value: number) => value * 0.01
      },
      mbar: {
        formula: 'value * 0.01',
        inverseFormula: 'value * 100',
        symbol: 'mbar',
        longName: 'millibar',
        convert: (value: number) => value * 0.01
      },
      bar: {
        formula: 'value * 0.00001',
        inverseFormula: 'value * 100000',
        symbol: 'bar',
        longName: 'bar',
        convert: (value: number) => value * 0.00001
      },
      psi: {
        formula: 'value * 0.0001450376807894691',
        inverseFormula: 'value / 0.0001450376807894691',
        symbol: 'psi',
        longName: 'pounds per square inch',
        convert: (value: number) => value * 0.0001450376807894691
      },
      inHg: {
        formula: 'value * 0.00029529987601298443',
        inverseFormula: 'value / 0.00029529987601298443',
        symbol: 'inHg',
        longName: 'inches of mercury',
        convert: (value: number) => value * 0.00029529987601298443
      },
      mmHg: {
        formula: 'value * 0.0075006168507298',
        inverseFormula: 'value / 0.0075006168507298',
        symbol: 'mmHg',
        longName: 'millimeters of mercury',
        convert: (value: number) => value * 0.0075006168507298
      },
      atm: {
        formula: 'value * 0.000009869232667160129',
        inverseFormula: 'value / 0.000009869232667160129',
        symbol: 'atm',
        convert: (value: number) => value * 0.000009869232667160129
      },
      cmh2o: {
        formula: 'value * 0.0101974428892211',
        inverseFormula: 'value / 0.0101974428892211',
        symbol: 'cmh2o',
        convert: (value: number) => value * 0.0101974428892211
      },
      inh2o: {
        formula: 'value * 0.004014741294968937',
        inverseFormula: 'value / 0.004014741294968937',
        symbol: 'inh2o',
        convert: (value: number) => value * 0.004014741294968937
      },
      torr: {
        formula: 'value * 0.0075006168507298',
        inverseFormula: 'value / 0.0075006168507298',
        symbol: 'torr',
        convert: (value: number) => value * 0.0075006168507298
      }
    }
  },
  m: {
    longName: 'meter',
    conversions: {
      mm: {
        formula: 'value * 1000',
        inverseFormula: 'value / 1000',
        symbol: 'mm',
        longName: 'millimeter',
        convert: (value: number) => value * 1000
      },
      cm: {
        formula: 'value * 100',
        inverseFormula: 'value / 100',
        symbol: 'cm',
        longName: 'centimeter',
        convert: (value: number) => value * 100
      },
      fathom: {
        formula: 'value * 0.5467468562055768',
        inverseFormula: 'value / 0.5467468562055768',
        symbol: 'fathom',
        longName: 'fathom',
        convert: (value: number) => value * 0.5467468562055768
      },
      angstrom: {
        formula: 'value * 10000000000',
        inverseFormula: 'value / 10000000000',
        symbol: 'angstrom',
        convert: (value: number) => value * 10000000000
      },
      AU: {
        formula: 'value * 6.684585813036146e-12',
        inverseFormula: 'value / 6.684585813036146e-12',
        symbol: 'AU',
        convert: (value: number) => value * 6.684585813036146e-12
      },
      datamile: {
        formula: 'value * 0.0005468066491688539',
        inverseFormula: 'value / 0.0005468066491688539',
        symbol: 'datamile',
        convert: (value: number) => value * 0.0005468066491688539
      },
      foot: {
        formula: 'value * 3.280839895013124',
        inverseFormula: 'value / 3.280839895013124',
        symbol: 'foot',
        convert: (value: number) => value * 3.280839895013124
      },
      furlong: {
        formula: 'value * 0.004970178926441352',
        inverseFormula: 'value / 0.004970178926441352',
        symbol: 'furlong',
        convert: (value: number) => value * 0.004970178926441352
      },
      inch: {
        formula: 'value * 39.37007874015748',
        inverseFormula: 'value / 39.37007874015748',
        symbol: 'inch',
        convert: (value: number) => value * 39.37007874015748
      },
      league: {
        formula: 'value * 0.0002071251035625518',
        inverseFormula: 'value / 0.0002071251035625518',
        symbol: 'league',
        convert: (value: number) => value * 0.0002071251035625518
      },
      'light-minute': {
        formula: 'value * 5.5594008077809377e-11',
        inverseFormula: 'value / 5.5594008077809377e-11',
        symbol: 'light-minute',
        convert: (value: number) => value * 5.5594008077809377e-11
      },
      'light-second': {
        formula: 'value * 3.3356404846685622e-9',
        inverseFormula: 'value / 3.3356404846685622e-9',
        symbol: 'light-second',
        convert: (value: number) => value * 3.3356404846685622e-9
      },
      'light-year': {
        formula: 'value * 1.0570234557732929e-16',
        inverseFormula: 'value / 1.0570234557732929e-16',
        symbol: 'light-year',
        convert: (value: number) => value * 1.0570234557732929e-16
      },
      kilometer: {
        formula: 'value * 0.001',
        inverseFormula: 'value / 0.001',
        symbol: 'km',
        convert: (value: number) => value * 0.001
      },
      mile: {
        formula: 'value * 0.000621371192237334',
        inverseFormula: 'value / 0.000621371192237334',
        symbol: 'mile',
        convert: (value: number) => value * 0.000621371192237334
      },
      'nm': {
        formula: 'value * 0.0005399568034557236',
        inverseFormula: 'value / 0.0005399568034557236',
        symbol: 'nm',
        convert: (value: number) => value * 0.0005399568034557236
      },
      parsec: {
        formula: 'value * 3.2407788498994385e-17',
        inverseFormula: 'value / 3.2407788498994385e-17',
        symbol: 'parsec',
        convert: (value: number) => value * 3.2407788498994385e-17
      },
      pica: {
        formula: 'value * 236.22047262694525',
        inverseFormula: 'value / 236.22047262694525',
        symbol: 'pica',
        convert: (value: number) => value * 236.22047262694525
      },
      point: {
        formula: 'value * 2834.645667505735',
        inverseFormula: 'value / 2834.645667505735',
        symbol: 'point',
        convert: (value: number) => value * 2834.645667505735
      },
      redshift: {
        formula: 'value * 7.67593433391696e-27',
        inverseFormula: 'value / 7.67593433391696e-27',
        symbol: 'redshift',
        convert: (value: number) => value * 7.67593433391696e-27
      },
      rod: {
        formula: 'value * 0.1988466892026248',
        inverseFormula: 'value / 0.1988466892026248',
        symbol: 'rod',
        convert: (value: number) => value * 0.1988466892026248
      },
      yard: {
        formula: 'value * 1.0936132983377078',
        inverseFormula: 'value / 1.0936132983377078',
        symbol: 'yard',
        convert: (value: number) => value * 1.0936132983377078
      }
    }
  },
  rad: {
    longName: 'radian',
    conversions: {
      arcminute: {
        formula: 'value * 3437.746770784939',
        inverseFormula: 'value / 3437.746770784939',
        symbol: 'arcminute',
        convert: (value: number) => value * 3437.746770784939
      },
      arcsecond: {
        formula: 'value * 206264.8062470964',
        inverseFormula: 'value / 206264.8062470964',
        symbol: 'arcsecond',
        convert: (value: number) => value * 206264.8062470964
      },
      degree: {
        formula: 'value * 57.29577951308231',
        inverseFormula: 'value / 57.29577951308231',
        symbol: '°',
        convert: (value: number) => value * 57.29577951308231
      },
      gradian: {
        formula: 'value * 63.66197723675812',
        inverseFormula: 'value / 63.66197723675812',
        symbol: 'gradian',
        convert: (value: number) => value * 63.66197723675812
      },
      rotation: {
        formula: 'value * 0.1591549430918954',
        inverseFormula: 'value / 0.1591549430918954',
        symbol: 'rotation',
        convert: (value: number) => value * 0.1591549430918954
      }
    }
  },
  'rad/s': {
    longName: 'radians per second',
    conversions: {
      'deg/s': {
        formula: 'value * 57.2958',
        inverseFormula: 'value * 0.0174533',
        symbol: '°/s',
        longName: 'degrees per second',
        key: 'deg/s',
        convert: (value: number) => value * 57.2958
      },
      rpm: {
        formula: 'value * 9.549296585513723',
        inverseFormula: 'value / 9.549296585513723',
        symbol: 'rpm',
        longName: 'revolutions per minute',
        convert: (value: number) => value * 9.549296585513723
      }
    }
  },
  m3: {
    longName: 'cubic meter',
    conversions: {
      beerbarrel: {
        formula: 'value * 8.521679072308338',
        inverseFormula: 'value / 8.521679072308338',
        symbol: 'beerbarrel',
        convert: (value: number) => value * 8.521679072308338
      },
      'beerbarrel-imp': {
        formula: 'value * 6.110256897196883',
        inverseFormula: 'value / 6.110256897196883',
        symbol: 'beerbarrel-imp',
        convert: (value: number) => value * 6.110256897196883
      },
      bushel: {
        formula: 'value * 28.37759178221265',
        inverseFormula: 'value / 28.37759178221265',
        symbol: 'bushel',
        convert: (value: number) => value * 28.37759178221265
      },
      cup: {
        formula: 'value * 4226.752810932216',
        inverseFormula: 'value / 4226.752810932216',
        symbol: 'cup',
        convert: (value: number) => value * 4226.752810932216
      },
      'fluid-ounce': {
        formula: 'value * 33814.02254462713',
        inverseFormula: 'value / 33814.02254462713',
        symbol: 'fluid-ounce',
        convert: (value: number) => value * 33814.02254462713
      },
      'fluid-ounce-imp': {
        formula: 'value * 35195.07972785405',
        inverseFormula: 'value / 35195.07972785405',
        symbol: 'fluid-ounce-imp',
        convert: (value: number) => value * 35195.07972785405
      },
      gallon: {
        formula: 'value * 264.1720512415585',
        inverseFormula: 'value / 264.1720512415585',
        symbol: 'gallon',
        convert: (value: number) => value * 264.1720512415585
      },
      'gallon-imp': {
        formula: 'value * 219.9692482990878',
        inverseFormula: 'value / 219.9692482990878',
        symbol: 'gallon-imp',
        convert: (value: number) => value * 219.9692482990878
      },
      liter: {
        formula: 'value * 1000',
        inverseFormula: 'value / 1000',
        symbol: 'liter',
        convert: (value: number) => value * 1000
      },
      oilbarrel: {
        formula: 'value * 6.289810770432104',
        inverseFormula: 'value / 6.289810770432104',
        symbol: 'oilbarrel',
        convert: (value: number) => value * 6.289810770432104
      },
      'pint-imp': {
        formula: 'value * 1759.7539863927022',
        inverseFormula: 'value / 1759.7539863927022',
        symbol: 'pint-imp',
        convert: (value: number) => value * 1759.7539863927022
      },
      quart: {
        formula: 'value * 1056.688204966234',
        inverseFormula: 'value / 1056.688204966234',
        symbol: 'quart',
        convert: (value: number) => value * 1056.688204966234
      },
      tablespoon: {
        formula: 'value * 67628.04531793189',
        inverseFormula: 'value / 67628.04531793189',
        symbol: 'tablespoon',
        convert: (value: number) => value * 67628.04531793189
      },
      teaspoon: {
        formula: 'value * 202884.1355421759',
        inverseFormula: 'value / 202884.1355421759',
        symbol: 'teaspoon',
        convert: (value: number) => value * 202884.1355421759
      }
    }
  },
  V: {
    longName: 'volt',
    conversions: {}
  },
  A: {
    longName: 'ampere',
    conversions: {}
  },
  W: {
    longName: 'watt',
    conversions: {
      kW: {
        formula: 'value * 0.001',
        inverseFormula: 'value * 1000',
        symbol: 'kW',
        longName: 'kilowatt',
        convert: (value: number) => value * 0.001
      },
      horsepower: {
        formula: 'value * 0.0013410220888438076',
        inverseFormula: 'value / 0.0013410220888438076',
        symbol: 'horsepower',
        convert: (value: number) => value * 0.0013410220888438076
      }
    }
  },
  ratio: {
    longName: 'ratio',
    conversions: {
      percent: {
        formula: 'value * 100',
        inverseFormula: 'value * 0.01',
        symbol: '%',
        longName: 'percent',
        convert: (value: number) => value * 100
      }
    }
  },
  Hz: {
    longName: 'hertz',
    conversions: {
      rpm: {
        formula: 'value * 60',
        inverseFormula: 'value * 0.0166667',
        symbol: 'rpm',
        longName: 'revolutions per minute',
        convert: (value: number) => value * 60
      }
    }
  },
  s: {
    longName: 'second',
    conversions: {
      century: {
        formula: 'value * 3.168876461541279e-10',
        inverseFormula: 'value / 3.168876461541279e-10',
        symbol: 'century',
        convert: (value: number) => value * 3.168876461541279e-10
      },
      day: {
        formula: 'value * 0.000011574074074074073',
        inverseFormula: 'value / 0.000011574074074074073',
        symbol: 'day',
        convert: (value: number) => value * 0.000011574074074074073
      },
      decade: {
        formula: 'value * 3.1688764615412793e-9',
        inverseFormula: 'value / 3.1688764615412793e-9',
        symbol: 'decade',
        convert: (value: number) => value * 3.1688764615412793e-9
      },
      fortnight: {
        formula: 'value * 8.26719576719577e-7',
        inverseFormula: 'value / 8.26719576719577e-7',
        symbol: 'fortnight',
        convert: (value: number) => value * 8.26719576719577e-7
      },
      hour: {
        formula: 'value * 0.0002777777777777778',
        inverseFormula: 'value / 0.0002777777777777778',
        symbol: 'hour',
        convert: (value: number) => value * 0.0002777777777777778
      },
      minute: {
        formula: 'value * 0.016666666666666666',
        inverseFormula: 'value / 0.016666666666666666',
        symbol: 'minute',
        convert: (value: number) => value * 0.016666666666666666
      },
      week: {
        formula: 'value * 0.000001653439153439154',
        inverseFormula: 'value / 0.000001653439153439154',
        symbol: 'week',
        convert: (value: number) => value * 0.000001653439153439154
      },
      year: {
        formula: 'value * 3.168876461541279e-8',
        inverseFormula: 'value / 3.168876461541279e-8',
        symbol: 'year',
        convert: (value: number) => value * 3.168876461541279e-8
      }
    }
  },
  C: {
    longName: 'coulomb',
    conversions: {
      C: {
        formula: 'value * 1',
        inverseFormula: 'value * 1',
        symbol: 'C',
        longName: 'coulomb',
        convert: (value: number) => value * 1
      },
      Ah: {
        formula: 'value * 0.0002777777777777778',
        inverseFormula: 'value / 0.0002777777777777778',
        symbol: 'Ah',
        longName: 'ampere-hour',
        convert: (value: number) => value * 0.0002777777777777778
      },
      mAh: {
        formula: 'value * 0.277778',
        inverseFormula: 'value * 3.6',
        symbol: 'mAh',
        longName: 'milliampere-hour',
        convert: (value: number) => value * 0.277778
      }
    }
  },
  'm3/s': {
    longName: 'cubic meters per second',
    conversions: {
      'L/h': {
        formula: 'value * 3600000',
        inverseFormula: 'value * 0.000000277778',
        symbol: 'L/h',
        longName: 'liters per hour',
        convert: (value: number) => value * 3600000
      },
      'L/min': {
        formula: 'value * 60000',
        inverseFormula: 'value * 0.0000166667',
        symbol: 'L/min',
        longName: 'liters per minute',
        convert: (value: number) => value * 60000
      },
      'gal/h': {
        formula: 'value * 264.17205236',
        inverseFormula: 'value / 264.17205236',
        symbol: 'gal/h',
        longName: 'gallons per hour',
        convert: (value: number) => value * 264.17205236
      },
      'gal-imp/h': {
        formula: 'value * 219.9692483',
        inverseFormula: 'value / 219.9692483',
        symbol: 'gal-imp/h',
        convert: (value: number) => value * 219.9692483
      }
    }
  },
  J: {
    longName: 'Joule',
    conversions: {
      btu: {
        formula: 'value * 0.0009478169879134378',
        inverseFormula: 'value / 0.0009478169879134378',
        symbol: 'btu',
        convert: (value: number) => value * 0.0009478169879134378
      },
      calorie: {
        formula: 'value * 0.2390057361376673',
        inverseFormula: 'value / 0.2390057361376673',
        symbol: 'calorie',
        longName: 'physics unit',
        convert: (value: number) => value * 0.2390057361376673
      },
      Calorie: {
        formula: 'value * 0.00023900573613766727',
        inverseFormula: 'value / 0.00023900573613766727',
        symbol: 'Calorie',
        longName: 'food energy',
        convert: (value: number) => value * 0.00023900573613766727
      },
      electronvolt: {
        formula: 'value * 6241509074460763000',
        inverseFormula: 'value / 6241509074460763000',
        symbol: 'electronvolt',
        convert: (value: number) => value * 6241509074460763000
      },
      erg: {
        formula: 'value * 10000000',
        inverseFormula: 'value / 10000000',
        symbol: 'erg',
        convert: (value: number) => value * 10000000
      },
      'therm-US': {
        formula: 'value * 9.480434279733487e-9',
        inverseFormula: 'value / 9.480434279733487e-9',
        symbol: 'therm-US',
        convert: (value: number) => value * 9.480434279733487e-9
      },
      Wh: {
        formula: 'value * 0.0002777777777777778',
        inverseFormula: 'value / 0.0002777777777777778',
        symbol: 'Wh',
        convert: (value: number) => value * 0.0002777777777777778
      },
      J: {
        formula: 'value * 1',
        inverseFormula: 'value / 1',
        symbol: 'joule',
        convert: (value: number) => value * 1
      }
    }
  },
  kg: {
    longName: 'Kilogram',
    conversions: {
      AMU: {
        formula: 'value * 6.0221412901167415e+26',
        inverseFormula: 'value / 6.0221412901167415e+26',
        symbol: 'AMU',
        convert: (value: number) => value * 6.0221412901167415e26
      },
      carat: {
        formula: 'value * 5000',
        inverseFormula: 'value / 5000',
        symbol: 'carat',
        convert: (value: number) => value * 5000
      },
      dalton: {
        formula: 'value * 6.0221412901167415e+26',
        inverseFormula: 'value / 6.0221412901167415e+26',
        symbol: 'dalton',
        convert: (value: number) => value * 6.0221412901167415e26
      },
      dram: {
        formula: 'value * 564.3833897001838',
        inverseFormula: 'value / 564.3833897001838',
        symbol: 'dram',
        convert: (value: number) => value * 564.3833897001838
      },
      grain: {
        formula: 'value * 15432.358352941434',
        inverseFormula: 'value / 15432.358352941434',
        symbol: 'grain',
        convert: (value: number) => value * 15432.358352941434
      },
      gram: {
        formula: 'value * 1000',
        inverseFormula: 'value / 1000',
        symbol: 'gram',
        convert: (value: number) => value * 1000
      },
      kilogram: {
        formula: 'value * 1',
        inverseFormula: 'value / 1',
        symbol: 'kilogram',
        convert: (value: number) => value * 1
      },
      'metric-ton': {
        formula: 'value * 0.001',
        inverseFormula: 'value / 0.001',
        symbol: 'metric-ton',
        convert: (value: number) => value * 0.001
      },
      ounce: {
        formula: 'value * 35.27396198068672',
        inverseFormula: 'value / 35.27396198068672',
        symbol: 'ounce',
        convert: (value: number) => value * 35.27396198068672
      },
      pound: {
        formula: 'value * 2.2046226218487757',
        inverseFormula: 'value / 2.2046226218487757',
        symbol: 'pound',
        convert: (value: number) => value * 2.2046226218487757
      },
      'short-ton': {
        formula: 'value * 0.001102311310924388',
        inverseFormula: 'value / 0.001102311310924388',
        symbol: 'short-ton',
        convert: (value: number) => value * 0.001102311310924388
      },
      slug: {
        formula: 'value * 0.0685217660314843',
        inverseFormula: 'value / 0.0685217660314843',
        symbol: 'slug',
        convert: (value: number) => value * 0.0685217660314843
      },
      stone: {
        formula: 'value * 0.15747304441776971',
        inverseFormula: 'value / 0.15747304441776971',
        symbol: 'stone',
        convert: (value: number) => value * 0.15747304441776971
      }
    }
  },
  m2: {
    longName: 'Square meter',
    conversions: {
      acre: {
        formula: 'value * 0.0002471053816137119',
        inverseFormula: 'value / 0.0002471053816137119',
        symbol: 'acre',
        convert: (value: number) => value * 0.0002471053816137119
      },
      hectare: {
        formula: 'value * 0.0001',
        inverseFormula: 'value / 0.0001',
        symbol: 'hectare',
        convert: (value: number) => value * 0.0001
      },
      sqft: {
        formula: 'value * 10.7639',
        inverseFormula: 'value / 10.7639',
        symbol: 'sqft',
        longName: 'square feet',
        convert: (value: number) => value * 10.7639
      }
    }
  },
}

interface UnitInfo {
  longName: string
}

const _UNITS: { [key: string]: UnitInfo } = {
  A: { longName: 'ampere' },
  Ah: { longName: 'ampere-hour' },
  AMU: { longName: 'AMU' },
  AU: { longName: 'AU' },
  Bf: { longName: 'Beaufort' },
  C: { longName: 'coulomb' },
  Calorie: { longName: 'food energy' },
  F: { longName: 'fahrenheit' },
  Hz: { longName: 'hertz' },
  J: { longName: 'Joule' },
  K: { longName: 'kelvin' },
  'L/h': { longName: 'liters per hour' },
  'L/min': { longName: 'liters per minute' },
  Pa: { longName: 'pascal' },
  V: { longName: 'volt' },
  W: { longName: 'watt' },
  Wh: { longName: 'Watt-hour' },
  acre: { longName: 'acre' },
  angstrom: { longName: 'angstrom' },
  arcminute: { longName: 'arcminute' },
  arcsecond: { longName: 'arcsecond' },
  atm: { longName: 'atmosphere' },
  bar: { longName: 'bar' },
  beerbarrel: { longName: 'beer barrel' },
  'beerbarrel-imp': { longName: 'imperial beer barrel' },
  bool: { longName: 'Boolean' },
  btu: { longName: 'British thermal unit' },
  bushel: { longName: 'bushel' },
  calorie: { longName: 'physics unit' },
  carat: { longName: 'carat' },
  century: { longName: 'century' },
  cm: { longName: 'centimeter' },
  cmh2o: { longName: 'centimeters of water' },
  cup: { longName: 'cup' },
  dalton: { longName: 'dalton' },
  datamile: { longName: 'data mile' },
  day: { longName: 'day' },
  decade: { longName: 'decade' },
  deg: { longName: 'Degree' },
  'deg/s': { longName: 'degrees per second' },
  dram: { longName: 'dram' },
  electronvolt: { longName: 'electron volt' },
  erg: { longName: 'erg' },
  fathom: { longName: 'fathom' },
  'fluid-ounce': { longName: 'fluid ounce' },
  'fluid-ounce-imp': { longName: 'imperial fluid ounce' },
  foot: { longName: 'foot' },
  fortnight: { longName: 'fortnight' },
  fps: { longName: 'feet per second' },
  furlong: { longName: 'furlong' },
  'gal-imp/h': { longName: 'imperial gallons per hour' },
  'gal/h': { longName: 'gallons per hour' },
  gallon: { longName: 'gallon' },
  'gallon-imp': { longName: 'imperial gallon' },
  gradian: { longName: 'gradian' },
  grain: { longName: 'grain' },
  gram: { longName: 'gram' },
  hPa: { longName: 'hectopascal' },
  hectare: { longName: 'hectare' },
  horsepower: { longName: 'horsepower' },
  hour: { longName: 'hour' },
  inHg: { longName: 'inches of mercury' },
  inch: { longName: 'inch' },
  inh2o: { longName: 'inches of water' },
  joule: { longName: 'joule' },
  kW: { longName: 'kilowatt' },
  kg: { longName: 'Kilogram' },
  kilogram: { longName: 'kilogram' },
  kilometer: { longName: 'kilometer' },
  km: { longName: 'kilometer' },
  'km/h': { longName: 'kilometers per hour' },
  kn: { longName: 'knots' },
  knot: { longName: 'knot' },
  kph: { longName: 'kilometers per hour' },
  league: { longName: 'league' },
  'light-minute': { longName: 'light-minute' },
  'light-second': { longName: 'light-second' },
  'light-year': { longName: 'light-year' },
  liter: { longName: 'liter' },
  m: { longName: 'meter' },
  'm/s': { longName: 'meters per second' },
  m2: { longName: 'Square meter' },
  m3: { longName: 'cubic meter' },
  'm3/s': { longName: 'cubic meters per second' },
  mAh: { longName: 'milliampere-hour' },
  mbar: { longName: 'millibar' },
  meter: { longName: 'meter' },
  'metric-ton': { longName: 'metric ton' },
  mile: { longName: 'mile' },
  min: { longName: 'minute' },
  minute: { longName: 'minute' },
  mm: { longName: 'millimeter' },
  mmHg: { longName: 'millimeters of mercury' },
  mph: { longName: 'miles per hour' },
  'nm': { longName: 'nautical mile' },
  nmi: { longName: 'nautical mile' },
  oilbarrel: { longName: 'oil barrel' },
  ounce: { longName: 'ounce' },
  parsec: { longName: 'parsec' },
  percent: { longName: 'percent' },
  pica: { longName: 'pica' },
  'pint-imp': { longName: 'imperial pint' },
  point: { longName: 'point' },
  pound: { longName: 'pound' },
  psi: { longName: 'pounds per square inch' },
  quart: { longName: 'quart' },
  rad: { longName: 'radian' },
  'rad/s': { longName: 'radians per second' },
  radian: { longName: 'radian' },
  ratio: { longName: 'ratio' },
  redshift: { longName: 'redshift' },
  rod: { longName: 'rod' },
  rotation: { longName: 'rotation' },
  rpm: { longName: 'revolutions per minute' },
  s: { longName: 'second' },
  second: { longName: 'second' },
  'short-ton': { longName: 'short ton' },
  slug: { longName: 'slug' },
  sqft: { longName: 'square feet' },
  stone: { longName: 'stone' },
  tablespoon: { longName: 'tablespoon' },
  teaspoon: { longName: 'teaspoon' },
  'therm-US': { longName: 'US therm' },
  torr: { longName: 'torr' },
  watt: { longName: 'watt' },
  week: { longName: 'week' },
  yard: { longName: 'yard' },
  year: { longName: 'year' }
}

export type UnitId = keyof typeof _UNITS
export const Units = _UNITS as { [key in UnitId]: UnitInfo }

export const getConversions = (unit: UnitId) =>
  STANDARD_CONVERSIONS[unit]?.conversions
