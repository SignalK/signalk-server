---
title: Notifications API
---

# Notifications API

## Initial Release

The initial release of the Notifications API implements functionality to enable the centralised management of alarms and notfications on the Signal K Server for raising and actioning notifications.

It does this by routing all deltas containing `notifications.` in the path  to the Notifications API, where each `PathValue` is placed into a separate `Update` and assigned a unique `notificationId`.

The`notificationId` can then be used to perform actions using the HTTP endpoints made available by the API at `/signalk/v2/api/notifications`.

Actions include:

- Silencing a notification
- Acknowledging a notification

>**Note:** Actions can only be performed on Notifications that contain a `state` and `method`.

### Silencing a Notification
Silencing a notification is achieved by sending an HTTP POST request to `/signalk/v2/api/notifications/{notificationId}/silence`.

The result of the request is that the `sound` value is removed from the `method` array.

The ability to silence a notification is determined by the `canSilence` status. If this value is `false` then the notifcation will not be silenced and an error response is sent to the requestor.

>**Note:** Notifications with `state = emergency` cannot be silenced regardles of the value of `canSilence`.


_Example: Notification prior to `silence` request._

```JSON
{
   "message": "Engine temperature is high!",
   "method": ["sound", "visual"],
   "state": "alert",
   "createdAt": "2025-12-17T05:54:24.937Z",
   "status": {
      "silenced": false,
      "acknowledged": false,
      "canSilence": true,
      "canAcknow;edge": true
   }
}
```

```typescript
HTTP POST "/signalk/v2/api/notifications/a987be59-d26f-46db-afeb-83987b837a8f/silence"
```

_Notification: post `silence` request_

```JSON
{
   "message": "Engine temperature is high!",
   "method": ["visual"],
   "state": "alert",
   "createdAt": "2025-12-17T05:57:12.529Z",
   "status": {
      "silenced": true,
      "acknowledged": false,
      "canSilence": true,
      "canAcknow;edge": true
   }
}
```

### Acknowledging a Notification
Acknowledging a notification is achieved by sending an HTTP POST request to `/signalk/v2/api/notifications/{notificationId}/acknowledge`.

The result of the request is that both the `sound` and `visual` values are removed from the `method` array.

>**Note:** Notifications with `state = emergency` will only have the `sound` value removed.

The ability to acknowledge a notification is determined by the `canAcknowledge` status. If this value is `false` then the notifcation will not be acknowledged and an error response is sent to the requestor.


_Example: Notification prior to `acknowledge` request._

```JSON
{
   "message": "Engine temperature is high!",
   "method": ["sound", "visual"],
   "state": "alert",
   "createdAt": "2025-12-17T05:54:24.937Z"
}
```

```typescript
HTTP POST "/signalk/v2/api/notifications/a987be59-d26f-46db-afeb-83987b837a8f/acknowledge"
```

_Notification: post `acknowledge` request_

```JSON
{
   "message": "Engine temperature is high!",
   "method": [],
   "state": "alert",
   "createdAt": "2025-12-17T05:54:24.937Z"
}
```

## NMEA 2000 Alert Processing

NMEA 2000 Alert PGNs are processed by `n2k-signalk` which generates a Signal K notification message with a path starting with `notifications.nmea.*`.

NMEA PGN fields are mapped to the `state`, `method` and `message` Signal K notification properties and additional properties are also added to the Notification value.

```json
{
   "path": "notifications.nmea.alarm.navigational.20.8196" //
   "value": {
      "state": "alarm",
      "method": [
         "visual",
         "sound"
      ],
      "message": "Highwater",
      "alertType": "Alarm",
      "alertCategory": "Navigational",
      "alertSystem": 20,
      "alertId": 8196,
      "dataSourceNetworkIDNAME": 1240095849160158000,
      "dataSourceInstance": 215,
      "dataSourceIndex-Source": 1,
      "occurrence": 2,
      "temporarySilenceStatus": "No",
      "acknowledgeStatus": "No",
      "escalationStatus": "No",
      "temporarySilenceSupport": "No",
      "acknowledgeSupport": "Yes",
      "escalationSupport": "No",
      "acknowledgeSourceNetworkIDNAME": 1233993293343261200,
      "triggerCondition": "Auto",
      "thresholdStatus": "Threshold Exceeded",
      "alertPriority": 0,
      "alertState": "Active"
      }
}
```

>The Notification API uses these additional properties to populate the `status` attributes that support silencing and acknowledging notifications.



### State Mapping
NMEA alert states are mapped to Signal K state as follows:

| NMEA2000 State  | Signal K State | Description |
| --------------- | -------------- |---          |
| Emergency Alarm | emergency      | A life-threatening condition |
| Alarm           | alarm          | Immediate action is required to prevent loss of life or equipment damage |
| Warning         | warn           | Indicates a condition that requires immediate attention but not immediate action |
| Caution         | alert          | Indicates a safe or normal condition which is brought to the operators attention to impart information for routine action purposes |
| --              | normal         | Indicates normal operation.    |
| --              | nominal        | This is can be used to indicate value has entered a range within the normal zone |          

_Reference: [Signal K Specification](https://signalk.org/specification/1.7.0/doc/data_model_metadata.html?highlight=emergency#metadata-for-a-data-value)_

### Method Mapping

Whilst `n2k-signalk` will set the `method` to an empty array if the alert has been `Acknowledged` or `Silenced`, the Notifications API will write the `method` value as outlined above in [Silencing a Notification](#silencing-a-notification) and [Acknowledging a Notification](#acknowledging-a-notification) .


