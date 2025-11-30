---
title: History API
---

# History API

The _History API_ provides access to historical data, typically stored in a database. The actual storage backend is not defined by this API and can be implemented in various ways, typically as a plugin like [signalk-parquet](https://www.npmjs.com/package/signalk-parquet) and [signalk-to-influxdb2](https://www.npmjs.com/package/signalk-to-influxdb2). The most common use case for the API is to show graphs of past values.

The API is available under the path `/signalk/v2/api/history`.

_Note: You can view the \_History API_ OpenAPI definition in the Admin UI (Documentation => OpenApi).\_

---

## Time Range Parameters

The time range for queries can be defined as a combination of **from**, **to** and **duration** parameters.

- **from**: Start of the time range, inclusive as ISO 8601 timestamp (e.g. `2018-03-20T09:13:28Z`)
- **to**: End of the time range, inclusive. Defaults to 'now' if omitted.
- **duration**: Duration of the time range in milliseconds (integer) or as an ISO8601 Duration string (e.g. `PT15M`). Can be specified with either 'from' or 'to'. If they are both omitted is relative to 'now'.

## Retrieving Historical Data

To retrieve historical data series for specific paths, submit a HTTP `GET` request to `/signalk/v2/api/history/values`.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/history/values?paths=navigation.speedOverGround&duration=PT1H'
```

### Query Parameters

| Parameter    | Description                                                                                                                                                                                                                                                                                                                 | Required |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `paths`      | Comma separated list of Signal K paths whose data should be retrieved. Optional aggregation methods for each path as postfix separated by a colon. Aggregation methods: 'average' \| 'min' \| 'max' \| 'first' \| 'last' \| 'mid' \| 'middle_index'. Example: `navigation.speedOverGround,navigation.speedThroughWater:max` | Yes      |
| `context`    | Signal K context that the data is about, defaults to 'vessels.self'. Example: `vessels.urn:mrn:imo:mmsi:123456789`                                                                                                                                                                                                          | No       |
| `resolution` | Length of data sample time window in milliseconds or as a time expression ('1s', '1m', '1h', '1d'). If resolution is not specified the server should provide data in a reasonable time resolution, depending on the time range in the request.                                                                              | No       |
| `from`       | Start of the time range                                                                                                                                                                                                                                                                                                     | No       |
| `to`         | End of the time range                                                                                                                                                                                                                                                                                                       | No       |
| `duration`   | Duration of the time range                                                                                                                                                                                                                                                                                                  | No       |

### Response Format

The response contains the requested data series with header information.

```JSON
{
  "context": "vessels.urn:mrn:imo:mmsi:123456789",
  "range": {
    "from": "2018-03-20T09:12:28Z",
    "to": "2018-03-20T09:13:28Z"
  },
  "values": [
    {
      "path": "navigation.speedOverGround",
      "method": "average"
    }
  ],
  "data": [
    ["2023-11-09T02:45:38.160Z", 13.2],
    ["2023-11-09T02:45:39.160Z", 13.4]
  ]
}
```

The `data` array contains arrays where the first element is the timestamp in ISO 8601 format, and subsequent elements correspond to the values for the requested paths in order. Missing data for a path is returned as `null`.

## Listing Available Contexts

To get a list of contexts that have some historical data available for a specified time range, submit a HTTP `GET` request to `/signalk/v2/api/history/contexts`.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/history/contexts?duration=P1D'
```

### Response Format

Returns an array of context strings.

```JSON
[
  "vessels.urn:mrn:imo:mmsi:123456789",
  "vessels.urn:mrn:imo:mmsi:987654321"
]
```

## Listing Available Paths

To get a list of paths that have some historical data available for a specified time range, submit a HTTP `GET` request to `/signalk/v2/api/history/paths`.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/history/paths?duration=P1D'
```

### Response Format

Returns an array of path strings.

```JSON
[
  "navigation.speedOverGround",
  "navigation.courseOverGroundTrue"
]
```
