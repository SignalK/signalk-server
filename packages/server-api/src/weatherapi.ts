import { Position } from '.'

export interface WeatherApi {
  register: (pluginId: string, provider: WeatherProvider) => void
  unRegister: (pluginId: string) => void
  emitWarning: (
    pluginId: string,
    position?: Position,
    warnings?: WeatherWarning[]
  ) => void
}

export interface WeatherProviderRegistry {
  registerWeatherProvider: (provider: WeatherProvider) => void
}

export interface WeatherProviders {
  [id: string]: {
    name: string
    isDefault: boolean
  }
}

export interface WeatherProvider {
  name: string // e.g. OpenWeather, Open-Meteo, NOAA
  methods: WeatherProviderMethods
}

export interface WeatherProviderMethods {
  pluginId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getData: (position: Position) => Promise<WeatherProviderData>
  getObservations: (position: Position) => Promise<WeatherData[]>
  getForecasts: (position: Position) => Promise<WeatherData[]>
  getWarnings: (position: Position) => Promise<WeatherWarning[]>
}

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

export type TendencyKind =
  | 'steady'
  | 'decreasing'
  | 'increasing'
  | 'not available'

export type PrecipitationKind =
  | 'reserved'
  | 'rain'
  | 'thunderstorm'
  | 'freezing rain'
  | 'mixed/ice'
  | 'snow'
  | 'reserved'
  | 'not available'
