import { CubicMeters, CubicMetersPerSecond, Hertz, Kelvin, Meters, Pascals, Radians, Ratio, Seconds, Volts } from './units';
import { FullValue } from './values';

/** Engine data, each engine identified by a unique name i.e. Port_Engine */
export type Propulsion = Record<string, Engine>

export interface Engine {
  /** Human readable label for the propulsion unit */
  label?: string;

  /** The current state of the engine */
  state?: FullValue<'stopped' | 'started' | 'unusable'>;

  /** Engine revolutions (x60 for RPM) */
  revolutions?: FullValue<Hertz>;

  /** Engine temperature */
  temperature?: FullValue<Kelvin>;

  /** Oil temperature */
  oilTemperature?: FullValue<Kelvin>;


  oilPressure?: FullValue<Pascals>;
  alternatorVoltage?: FullValue<Volts>;

  /** Total running time for engine (Engine Hours in seconds) */
  runTime?: FullValue<Seconds>;

  coolantTemperature?: FullValue<Kelvin>;

  coolantPressure?: FullValue<Pascals>;

  /** Engine boost (turbo, supercharger) pressure */
  boostPressure?: FullValue<Pascals>;

  intakeManifoldTemperature?: FullValue<Kelvin>;

  /** Engine load ratio, 0<=ratio<=1, 1 is 100% */
  engineLoad?: FullValue<Ratio>;

  /** Engine torque ratio, 0<=ratio<=1, 1 is 100% */
  engineTorque?: FullValue<Ratio>;

  /** The transmission (gear box) of the named engine */
  transmission?: {
    /** Currently selected gear the engine is in i.e. Forward, Reverse, etc. */
    gear?: FullValue<'Forward' | 'Neutral' | 'Reverse' | 'Fault'>

    /** Gear ratio, engine rotations per propeller shaft rotation */
    gearRatio?: FullValue<Ratio>;

    oilTemperature?: FullValue<Kelvin>;

    oilPressure?: FullValue<Pascals>;
  };

  /** Data about the engine's drive. */
  drive?: {
    /** The type of drive the boat has i.e Outboard, shaft, jet, etc. */
    type?: 'saildrive' | 'shaft' | 'outboard' | 'jet' | 'pod' | 'other';

    /** Trim/tilt state, 0<=ratio<=1, 1 is 100% up */
    trimState?: FullValue<Ratio>;

    /** Current thrust angle for steerable drives, +ve is thrust to Starboard */
    thrustAngle?: FullValue<Radians>;

    /** Data about the drive's propeller (pitch and slip) */
    propeller?: {
      /** Current pitch of propeller, the distance the propeller would advance during one revolution of the propeller without slip */
      pitch: FullValue<Meters>

      /** Propeller slip, the ratio of 'lost' distance (1 - (actual distance travelled/propeller pitch distance)). 0<=ratio<=1, 0 is 0% slip (ideal), 1 is 100% slip */
      slip: FullValue<Ratio>
    };
  };

  /** Data about the engine's Fuel Supply */
  fuel?: {
    /** Fuel type */
    type?: 'diesel' | 'petrol' | 'electric' | 'coal/wood' | 'other';

    /** Used fuel since last reset. Resetting is at user discretion */
    used?: FullValue<CubicMeters>;

    /** Fuel pressure */
    pressure?: FullValue<Pascals>;

    /** Fuel rate of consumption */
    rate?: FullValue<CubicMetersPerSecond>;

    /** Economy fuel rate of consumption */
    economyRate?: FullValue<CubicMetersPerSecond>;

    /** Average fuel rate of consumption */
    averageRate?: FullValue<CubicMetersPerSecond>;
  };

  exhaustTemperature?: FullValue<Kelvin>;
};
