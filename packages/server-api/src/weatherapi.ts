import { Position } from '.'


export interface WeatherApi {
  register: (pluginId: string, provider: WeatherProvider) => void
  unRegister: (pluginId: string) => void
  /**
   * This method is called to emit a Signal K notification message containing
   * weather warning details.
   * 
   * @category Weather API
   * 
   * @param pluginId - the weather provider plugin identifier
   * @param position - Position object {@link Position}
   * @param warnings - Array of WeatherWarning objects {@link WeatherWarning}
   *
   * @example
    ```
    emitWarning: (
      pluginId: 'myPluginId',
      position: {latitude: 59.3, longitude: 9.1234},
      warnings: [
        {
            details: 'Strong wind warning',
            startTime: '2025-05-02T04:01:00.000Z';
            endTime: '2025-05-02T04:18:00.000Z';
            source: 'MyWeatherService';
            type: 'Warning';
        }
      ]
    )
    ```
  */
  emitWarning: (
    pluginId: string,
    position?: Position,
    warnings?: WeatherWarning[]
  ) => void
}


export interface WeatherProviderRegistry {
  /**
   * Used by _Weather Provider plugins_ to register the weather service from which the data is sourced.
   * See [`Weather Provider Plugins`](../../../docs/develop/plugins/weather_provider_plugins.md#registering-as-a-weather-provider) for details.
   *
   * @category Weather API
   */
  registerWeatherProvider: (provider: WeatherProvider) => void

  emitWeatherWarning (
    pluginId: string,
    position?: Position,
    warnings?: WeatherWarning[]
  ): void
}

/**
 * @hidden visible through ServerAPI
 */
export interface WeatherProviders {
  [id: string]: {
    name: string
    isDefault: boolean
  }
}

/**
 * @hidden visible through ServerAPI
 * @see {isWeatherProvider} ts-auto-guard:type-guard */
export interface WeatherProvider {
  name: string // e.g. OpenWeather, Open-Meteo, NOAA
  methods: WeatherProviderMethods
}

export interface WeatherProviderMethods {
  pluginId?: string
  /**
   * Retrieves weather data from the weather provider for the supplied position.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   * 
   * @example
    ```javascript
    getData({latitude: 16.34765, longitude: 12.5432});
    ```
    ```JSON
    {
      "id": "df85kfo",
      "position": {"latitude": 16.34765, "longitude": 12.5432},
      "observations": [...],
      "forecasts": [...],
      "warnings": [...]
    }
    ```
  */
  getData: (position: Position) => Promise<WeatherProviderData>
  
  /**
   * Retrieves observation data from the weather provider for the supplied position.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   * 
   * @example
    ```javascript
    getObservations({latitude: 16.34765, longitude: 12.5432});
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
  getObservations: (position: Position) => Promise<WeatherData[]>

  /**
   * Retrieves forecast data from the weather provider for the supplied position.
   *
   * @category Weather API
   * 
   * @param position Location of interest 
   * 
   * @example
    ```javascript
    getForecasts({latitude: 16.34765, longitude: 12.5432});
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
  getForecasts: (position: Position) => Promise<WeatherData[]>

  /**
   * Retrieves warning data from the weather provider for the supplied position.
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
 * @hidden visible through ServerAPI
 */
export interface WeatherProviderData {
  id: string
  position: Position
  observations: WeatherData[]
  forecasts: WeatherData[]
  warnings?: Array<WeatherWarning>
}

export interface WeatherWarning {
  startTime: string
  endTime: string
  details: string
  source: string
  type: string
}

// Aligned with Signal K environment specification
/**
 * @hidden visible through ServerAPI
 */
export interface WeatherData {
  description?: string
  date: string
  type: 'daily' | 'point' | 'observation' // daily forecast, point-in-time forecast, observed values
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
 * @hidden visible through ServerAPI
 */
export type TendencyKind =
  | 'steady'
  | 'decreasing'
  | 'increasing'
  | 'not available'

  /**
 * @hidden visible through ServerAPI
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
