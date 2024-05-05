# Working with Weather Data

## Introduction

This document outlines the way in which weather data is managed in Signal K and how to reliably access and use weather data from various sources.

The Signal K specification defines an [`environment`](https://github.com/SignalK/specification/blob/master/schemas/groups/environment.json) schema which contains attributes pertaining to weather and the environment, grouped under headings such as `outside`, `inside`, `water`, `wind`, etc.

The `environment` schema is then able to be applied to Signal K contexts such as `vessels`, `atons`, `meteo`, etc to allow Signal K client apps to reliably consume weather data.

Additionally, the `environment` schema is used by the `Weather API` to provide access to observation and forecast information sourced from weather service providers.

Following are the different contexts and their use.


## 1. On Vessel sensors

Sensors installed on a vesssel making measurements directly outside of the vessel _(e.g. temperature, humidity, etc)_ are placed in the `vessels.self` context.

_On vessel sensor data paths:_

- `vessels.self.environment.outside.*` Measurements taken outside the vessel hull
- `vessels.self.environment.inside.*` Measurements taken inside the vessel hull
- `vessels.self.environment.water.*` Measurements taken relating to the water the vessel is in.


## 2. AIS Weather Sources

Environment data from AIS weather stations via NMEA0183 `VDM` sentences are placed in the `meteo` context, with each station identified by a unique identifier.

_Example - AIS sourced weather data paths:_

- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.outside.*` 
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.inside.*` 
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.water.*`
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.tide.*`
- `meteo.urn:mrn:imo:mmsi:123456789:081751.environment.current.*`


## 3. Weather Service Providers _(Weather API)_

Weather service providers provide a collection of observations, forecasts and weather warnings for a location that can include:
- Current and historical data (observations)
- Daily and "point in time" forecasts
over varying time periods.  

This information is updated at regular intervals (e.g. hourly) and will relate to an area (of varying size) based on the location provided.

The nature of this data makes it more suited to a REST API rather than a websocket stream and as such the [Signal K Weather API](../../develop/rest-api/weather_api.md) is where this information is made available.

As each weather provider tends to have different interfaces to source information, [Signal K Server plugins](../../develop/plugins/weather_provider_plugins.md) provide the vehicle for fetching and transforming the data from the various data sources and making it available via the Weather API.

The Weather API supports the use of multiple weather provider plugins with the ability to switch between them.

_Example: Fetching weather data for a location._
- `GET "/signalk/v2/api/weather?lat=5.432&lon=7.334` 


