# Working with Weather Data

## Introduction

This document outlines the way in which weather data is managed in Signal K and how to reliably access and use weather data from various sources.

The Signal K specification defines an [`environment`](https://github.com/SignalK/specification/blob/master/schemas/groups/environment.json) schema which contains attributes pertaining to weather and the environment, grouped under headings such as `outside`, `inside`, `water`, `wind`, etc.

The `environment` schema is then able to be applied to Signal K contexts such as `vessel`, `aton`, `meteo`, etc. In order for Signal K client apps to reliably consume weather data it is important to understand these contexts and their use.


## On Vessel sensors

The values from environment sensors installed on a vesssel which provide measurements in relation to that vessel are foound under the `vessels.self` context.

_Example:_

- `vessels.self.environment.outside` - Measurements taken outside the vessel hull
- `vessels.self.environment.inside` - Measurements taken inside the vessel hull
- `vessels.self.environment.water` - Measurements taken from the water the vessel is in.


## AIS Weather stations

Weather observation data sourced from AIS weather stations via `VDM` sentences are found under the `meteo` context, with each station having a unique identifier.

_Example:_

- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.outside` 
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.inside` 
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.water`
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.tide`
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.current`


## Weather Services

Data sourced from weather services is generally comprised of a collection of observations, forecasts and warnings for a specific location updated at regular intervals (e.g. hourly).

Observations may be a combination of current and historical measurements and forecasts a combination of daily and "point in time" values. 

The nature of this data makes it more suited to a REST API rather than a websocket stream and as such the [Signal K Weather API](../../develop/rest-api/weather_api.md) is where this information is made available.

Signal K Server plugins are the vehicle for fetching and transforming the data from the various data services and make it available via the Weather API.

For example, a `provider plugin` sourcing data from the Open-Meteo service can provide current and historical observation data as well as daily and hourly forecast information.


_Example:_

- `GET "/signalk/v2/api/weather?lat=5.432&lon=7.334` 
- `GET "/signalk/v2/api/weather/forecasts?lat=5.432&lon=7.334` 
- `GET "/signalk/v2/api/weather/observations?lat=5.432&lon=7.334`

