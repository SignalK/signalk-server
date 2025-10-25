import { Position } from '.'

/** @category  Weather API  */
export interface WeatherApi {
  register: (pluginId: string, provider: WeatherProvider) => void
  unRegister: (pluginId: string) => void
}

/** @category Weather API  */
export interface WeatherProviderRegistry {
  /**
   * Used by _Weather Provider plugins_ to register the weather service from which the data is sourced.
   * See [`Weather Provider Plugins`](../../../docs/develop/plugins/weather_provider_plugins.md#registering-a-weather-provider) for details.
   *
   * @category Weather API
   */
  registerWeatherProvider: (provider: WeatherProvider) => void
}

/**
 * @hidden visible through ServerAPI
 * @category  Weather API
 */
export interface WeatherProviders {
  [id: string]: {
    name: string
    isDefault: boolean
  }
}

/**@category  Weather API */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isWeatherProvider = (obj: any) => {
  const typedObj = obj
  return (
    ((typedObj !== null && typeof typedObj === 'object') ||
      typeof typedObj === 'function') &&
    typeof typedObj['name'] === 'string' &&
    ((typedObj['methods'] !== null &&
      typeof typedObj['methods'] === 'object') ||
      typeof typedObj['methods'] === 'function') &&
    (typeof typedObj['methods']['pluginId'] === 'undefined' ||
      typeof typedObj['methods']['pluginId'] === 'string') &&
    typeof typedObj['methods']['getObservations'] === 'function' &&
    typeof typedObj['methods']['getForecasts'] === 'function' &&
    typeof typedObj['methods']['getWarnings'] === 'function'
  )
}

/** @category  Weather API */
export interface WeatherProvider {
  name: string
  methods: WeatherProviderMethods
}

/** @category  Weather API */
export interface WeatherProviderMethods {
  pluginId?: string

  /**
   * Retrieves observation data from the weather provider for the supplied position.
   * The returned array of observations should be ordered in descending date order.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   * @param options Options
   * 
   * @example
    ```javascript
    getObservations({latitude: 16.34765, longitude: 12.5432}, {maxCount: 1});
    ```

    ```JSON
    [
        {
            "date": "2024-05-03T06:00:00.259Z",
            "type": "observation",
            "outside": { ... }
        },
        {
            "date": "2024-05-03T05:00:00.259Z",
            "type": "observation",
            "outside": { ... }
        }
    ]
    ```
  */
  getObservations: (
    position: Position,
    options?: WeatherReqParams
  ) => Promise<WeatherData[]>

  /**
   * Retrieves forecast data from the weather provider for the supplied position, forecast type and number of intervals.
   * The returned array of forecasts should be ordered in ascending date order.
   * 
   * @category Weather API
   * 
   * @param position Location of interest 
   * @param type Type of forecast point | daily
   * @param options Options
   * 
   * @example
   * Retrieve point forecast data for the next eight point intervalss
    ```javascript
    getForecasts(
      {latitude: 16.34765, longitude: 12.5432}, 
      'point',
      {maxCount: 8}
    );
    ```

    ```JSON
    [
        {
            "date": "2024-05-03T06:00:00.259Z",
            "type": "point",
            "outside": { ... }
        },
        {
            "date": "2024-05-03T05:00:00.259Z",
            "type": "point",
            "outside": { ... }
        }
    ]
    ```
  */
  getForecasts: (
    position: Position,
    type: WeatherForecastType,
    options?: WeatherReqParams
  ) => Promise<WeatherData[]>

  /**
   * Retrieves warning data from the weather provider for the supplied position.
   * The returned array of warnings should be ordered in ascending date order.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   *
   * @example
    ```javascript
    getWarnings({latitude: 16.34765, longitude: 12.5432});
    ```

    ```JSON
    [
      {
        "startTime": "2024-05-03T05:00:00.259Z",
        "endTime": "2024-05-03T08:00:00.702Z",
        "details": "Strong wind warning.",
        "source": "MyWeatherService",
        "type": "Warning"
      }
    ]
    ```
  */
  getWarnings: (position: Position) => Promise<WeatherWarning[]>
}

/**
 * @category  Weather API
 */
export interface WeatherWarning {
  startTime: string
  endTime: string
  details: string
  source: string
  type: string
}

/**
 * Request options
 *
 * @prop maxCount Maximum number of records to return
 * @prop startDate Start date of forecast / observation data (format: YYYY-MM-DD)
 * @prop custom Additional query parameters in the API request
 * @category  Weather API
 */
export interface WeatherReqParams {
  maxCount?: number
  startDate?: string
  custom?: { [key: string]: string | number | boolean | object | null }
}

/**
 * @category  Weather API
 */
export type WeatherForecastType = 'daily' | 'point'
/**
 * @category  Weather API
 */
export type WeatherDataType = WeatherForecastType | 'observation'

// Aligned with Signal K environment specification
/**
 * @category  Weather API
 */
export interface WeatherData {
  description?: string
  date: string
  type: WeatherDataType // daily forecast, point-in-time forecast, observed values
  outside?: {
    minTemperature?: number
    maxTemperature?: number
    feelsLikeTemperature?: number
    precipitationVolume?: number
    absoluteHumidity?: number
    horizontalVisibility?: number
    uvIndex?: number
    cloudCover?: number
    temperature?: number
    dewPointTemperature?: number
    pressure?: number
    pressureTendency?: TendencyKind
    relativeHumidity?: number
    precipitationType?: PrecipitationKind
  }
  water?: {
    temperature?: number
    level?: number
    levelTendency?: TendencyKind
    surfaceCurrentSpeed?: number
    surfaceCurrentDirection?: number
    salinity?: number
    waveSignificantHeight?: number
    wavePeriod?: number
    waveDirection?: number
    swellHeight?: number
    swellPeriod?: number
    swellDirection?: number
  }
  wind?: {
    speedTrue?: number
    directionTrue?: number
    gust?: number
    gustDirection?: number
  }
  sun?: {
    sunrise?: string
    sunset?: string
  }
}

/**
 * @category  Weather API
 */
export type TendencyKind =
  | 'steady'
  | 'decreasing'
  | 'increasing'
  | 'not available'

/**
 * @category  Weather API
 */
export type PrecipitationKind =
  | 'reserved'
  | 'rain'
  | 'thunderstorm'
  | 'freezing rain'
  | 'mixed/ice'
  | 'snow'
  | 'reserved'
  | 'not available'
