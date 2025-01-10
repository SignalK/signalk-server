# Working with the Alerts API

#### (Under Development)

_Note: This API is currently under development and the information provided here is likely to change._

[View the PR](https://github.com/SignalK/signalk-server/pull/1560) for more details.

## Overview

The Alerts API provides a mechanism for applications to issue requests for raising and actioning alarms and notifications when operating conditions
become abnormal and measured values fall outside of acceptable thresholds.

The Alerts API requests are sent to `/signalk/v2/api/alerts`.

Alerts are assigned a unique identifier when created, which is used when undertaking subsequent operations e.g. silencing, acknkowledging, etc.

Additionally, _Notifications_ raised by an alert will also contain the alert identifer in both their `path` and `value`.

_Example:_
```javascript
// Alert ID:
"74dbf514-ff33-4a3f-b212-fd28bd106a88"

// Notification path
"notifications.74dbf514-ff33-4a3f-b212-fd28bd106a88"

// Notification value
{
  "id": "74dbf514-ff33-4a3f-b212-fd28bd106a88",
  "method": ["visual","sound"],
  "state": "alarm",
  "message": "My Alert Message!",
  "metaData": {
    "name": "My Alert",
    "created": "2025-01-10T02:49:13.080Z"
  }
}
```


## Supported Operations

### Individual Alert

- [Raise](#raising-alerts): `POST /signalk/v2/api/alerts`
- [Retrieve](#retrieve-alert): `GET /signalk/v2/api/alerts/{id}`
- [Acknowledge](#acknowledge-alert): `POST /signalk/v2/api/alerts/{id}/ack`
- [Unacknowledge](#unacknowledge-alert): `POST /signalk/v2/api/alerts/{id}/unack`
- [Silence](#silence-alert): `POST /signalk/v2/api/alerts/{id}/silence`
- [Update metadata](#update-alert-metadata): `PUT /signalk/v2/api/alerts/{id}/properties`
- [Change priority](#change-alert-priority): `PUT /signalk/v2/api/alerts/{id}/priority`
- [Resolve](#resolve-alert): `POST /signalk/v2/api/alerts/{id}/resolve`
- [Remove](#remove-alert): `DELETE /signalk/v2/api/alerts/{id}`

### ALL Alerts

- [List](#listing-alerts): `GET /signalk/v2/api/alerts`
- [Acknowledge](#acknowledge-all-alerts): `POST /signalk/v2/api/alerts/ack`
- [Silence](#silence-all-alerts): `POST /signalk/v2/api/alerts/silence`
- [Clean](#remove-all-resolved-alerts): `DELETE /signalk/v2/api/alerts`


### Notifications

Alerts will emit Notifications throughout their lifecycle to indicate changes in status and when they are resolved. See [Notifications](#notifications-emitted-by-alerts) section for details.

---

### Raising Alerts

To create a new alert, submit an HTTP `POST` request to `/signalk/v2/api/alerts` providing the `priority` of the alert.

You can also specify additional `properties` which will be included in the alert `metadata` attribute. 

_Example:_
```typescript
HTTP GET "/signalk/v2/api/alerts" {   
    "priority": "alarm".
    "properties": {
        "name": "My Alert",
        "message": "My alert message"
    }
}
```
The `properties` attribute is an object containing key | value pairs, which can be used to hold relevant data for an alert. It should be noted that the following keys have been defined by the Alerts API:
```javascript
{
  name: //string value representing the alert name
  message: //string value containing the alert message
  position: //Signal K position object representing the vessel's postion when the alert was raised e.g. {latitude: 5.3876, longitude: 10.76533} 
  path: // Signal K path associated with the alert e.g. "electrical.battery.1"
  sourceRef: // Source of the alert
}
```

The response will be an object detailing the status of the operation which includes the `id`
of the alert created. This `id` can be used to take further action on the alert and it is included the path of notifications emitted by the alert.

_Example:_
```JSON
{
    "state": "COMPLETED",
    "statusCode": 201,
    "id": "74dbf514-ff33-4a3f-b212-fd28bd106a88"
}
```


### Retrieve Alert
To retireve the value of an alert, submit an HTTP `GET` request to `/signalk/v2/api/alerts/{id}` supplying th the id of the alert. 

_Request:_
```bash
HTTP GET "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88" 
```
_Response:_
```JSON
{
    "id": "74dbf514-ff33-4a3f-b212-fd28bd106a88",
    "created": "2025-01-02T08:19:58.676Z",
    "resolved": "2025-01-02T08:21:12.382Z",
    "priority": "alarm",
    "process": "normal",
    "alarmState": "inactive",
    "acknowledged": false,
    "silenced": false,
    "metaData": {
        "sourceRef": "alertsApi",
        "name": "My Alert",
        "message": "My alert message"
    }
}
```

### Acknowledge Alert
To acknowledge an alert, submit an HTTP `POST` request to `/signalk/v2/api/alerts/{id}/ack` supplying th the id of the alert. 

_Example:_
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/ack" 
```

### Unacknowledge Alert
To unacknowledge an alert, submit an HTTP `POST` request to `/signalk/v2/api/alerts/{id}/unack` supplying th the id of the alert. 

_Example:_
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/unack" 
```

### Silence Alert
To silence an alert for 30 seconds, submit an HTTP `POST` request to `/signalk/v2/api/alerts/{id}/silence` supplying th the id of the alert. 

_Example:_
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/silence" 
```

### Resolve Alert
To resolve (set condition to normal), submit an HTTP `POST` request to `/signalk/v2/api/alerts/{id}/resolve` supplying th the id of the alert. 

_Example:_
```typescript
HTTP DELETE "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/resolve" 
```


### Update Alert Metadata

To update the alert metadata, submit an HTTP `PUT` request to `/signalk/v2/api/alerts/{id}/properties` and provide the data in the body of the request. 

_Example:_
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88" {   
    "message": "My updated alert message"
}
```

### Change Alert Priority

To update the alert priority, submit an HTTP `PUT` request to `/signalk/v2/api/alerts/{id}/priority` and provide the new priority in the body of the request. 

_Example:_
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/priority" {   
    "priority": "emergency"
}
```

### Remove Alert
To remove an alert from the alert list, submit an HTTP `DELETE` request to `/signalk/v2/api/alerts/{id}` supplying th the id of the alert. 

_Example:_
```typescript
HTTP DELETE "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88" 
```


### Listing Alerts

To retrieve a list of all alerts, submit an HTTP `GET` request to `/signalk/v2/api/alerts`.

The response will be an object containing all alerts currently being managed (both active and resolved) keyed by their identifier.

The list can be filtered via the use of the following query parameters:
- `priority`: return only alerts with the specified priority
- `unack`: return only unacknowledged alerts _(only applies to `emergency` or `alarm` priorities)_
- `top`: return the x most recent alerts

```typescript
HTTP GET "/signalk/v2/api/alerts?priority=alarm"
```
_Example: List of alerts with a priority of `alarm`._

```JSON
{
    "0a8a1b07-8428-4e84-8259-1ddae5bf70de": {
        "id": "0a8a1b07-8428-4e84-8259-1ddae5bf70de",
        "created": "2025-01-02T08:19:58.676Z",
        "priority": "alarm",
        "process": "abnormal",
        "alarmState": "active",
        "acknowledged": false,
        "silenced": false,
        "metaData": {
            "sourceRef": "alertsApi",
            "name": "My Alert",
            "message": "My alert message"
        }
    }
},
{
    "74dbf514-ff33-4a3f-b212-fd28bd106a88": {
        "id": "74dbf514-ff33-4a3f-b212-fd28bd106a88",
        "created": "2025-01-02T08:19:58.676Z",
        "resolved": "2025-01-02T08:21:41.996Z",
        "priority": "alarm",
        "process": "normal",
        "alarmState": "inactive",
        "acknowledged": false,
        "silenced": false,
        "metaData": {
            "sourceRef": "alertsApi",
            "name": "My other Alert",
            "message": "My other alert message"
        }
    }
}
```

### Acknowledge ALL Alerts
To acknowledge an alert, submit an HTTP `POST` request to `/signalk/v2/api/alerts/{id}/ack` supplying th the id of the alert. 

_Example: Acknowledge alert._
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/ack" 
```

### Silence ALL Alerts
To silence an alert for 30 seconds, submit an HTTP `POST` request to `/signalk/v2/api/alerts/{id}/silence` supplying th the id of the alert. 

_Example: Silence alert._
```typescript
HTTP PUT "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88/silence" 
```

### Remove ALL Resolved Alerts
To resolve (set condition to normal), submit an HTTP `DELETE` request to `/signalk/v2/api/alerts/{id}` supplying th the id of the alert. 

_Example: Resolve alert._
```typescript
HTTP DELETE "/signalk/v2/api/alerts/74dbf514-ff33-4a3f-b212-fd28bd106a88" 
```

---

## Notifications emitted by Alerts

Alerts will emit Notifications reflecting the current state that include both the alert identifier and metadata, whenever their state changes.

Notifications are created under the path `notifications.{alertId}` by default.

_Example:_
```javascript
// alert 
"0a8a1b07-8428-4e84-8259-1ddae5bf70de": {
    ...
    "metaData": {
        "name": "My Alert"
    }
}

// notification path
notification.0a8a1b07-8428-4e84-8259-1ddae5bf70de
{
    "message": "My alert message!",
    "state": "alarm",
    "method": ["visual","sound"],
    "id": "0a8a1b07-8428-4e84-8259-1ddae5bf70de",
    "metaData": {
        "name": "My alert"
    }
}

```

If a `path` is included in the Alert metadata then this is incluided in the Notification path.

_Example:_
```javascript
// alert 
"0a8a1b07-8428-4e84-8259-1ddae5bf70de": {
    "metaData": {
        "path": "electrical.battery.1"
    }
    ...
}

// notification path
notification.electrical.battery.1.0a8a1b07-8428-4e84-8259-1ddae5bf70de
```
