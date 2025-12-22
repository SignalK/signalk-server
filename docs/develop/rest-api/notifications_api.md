---
title: Notifications API
---

# Notifications API

#### (Initial)

_Note: This is an inital release of the notifications API to implement the foundation to support
centralised management of alarms and notfications providing a set of operations for raising, actioning and clearing notifications._

It places all notifications in their own update and assigns a unique `notificationId` which can then be used to perform actions.

Additionally, HTTP endpoints for interactive use are made available at `/signalk/v2/api/notifications`.

- To silence a notification send an HTTP POST request to `/signalk/v2/api/notifications/{notificationId}/silence`

_Example: Silence notification - before_

```JSON
{
   "updates": [
      {
         "values":[
            {
               "path":"notifications.mob.a987be59-d26f-46db-afeb-83987b837a8f",
               "value": {
                    "message": "Person Overboard!",
                    "method": ["sound", "visual"],
                    "state": "emergency",
                    "createdAt": "2025-12-17T05:54:24.937Z"
                }
            }
        ],
       "$source":"freeboard-sk",
       "timestamp":"2025-12-15T04:37:04.549Z",
       "notificationId":"a987be59-d26f-46db-afeb-83987b837a8f"
     },
  ]
}
```

```
HTTP POST "/signalk/v2/api/notifications/a987be59-d26f-46db-afeb-83987b837a8f/silence"
```

_Silence notification: after_

```JSON
{
   "updates": [
      {
         "values":[
            {
               "path":"notifications.mob.a987be59-d26f-46db-afeb-83987b837a8f",
               "value": {
                    "message": "Person Overboard!",
                    "method": ["visual"],
                    "state": "emergency",
                    "createdAt": "2025-12-17T05:54:24.937Z"
                }
            }
        ],
       "$source":"freeboard-sk",
       "timestamp":"2025-12-15T04:37:04.549Z",
       "notificationId":"a987be59-d26f-46db-afeb-83987b837a8f"
     },
  ]
}
```

## NMEA 2000 to Signal K Alert Mapping

NMEA 2000 Alert PGNs are processed by `n2k-signalk` which generates a Signal K notification message _(`notifications.nmea.*`)_ and maps PGN fields to the `state`, `method` and `message` properties.

### State Mapping

| NMEA2000 State  | Signal K State |
| --------------- | -------------- |
| Emergency Alarm | emergency      |
| Alarm           | alarm          |
| Warning         | warn           |
| Caution         | alert          |
| --              | normal         |
| --              | nominal        |

#### States ascending order of severity:

| State     | Description                                                                                                                        | Method               | Method _(Silenced)_ | Method _(Acknowledged)_ |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------- | ----------------------- |
| nominal   | This is can be used to indicate value has entered a range within the normal zone.                                                  | []                   | n/a                 | n/a                     |
| normal    | Indicates normal operation.                                                                                                        | []                   | n/a                 | n/a                     |
| alert     | Indicates a safe or normal condition which is brought to the operators attention to impart information for routine action purposes | ['display', 'sound'] | ['display']         | []                      |
| warn      | Indicates a condition that requires immediate attention but not immediate action                                                   | ['display', 'sound'] | ['display']         | []                      |
| alarm     | Immediate action is required to prevent loss of life or equipment damage                                                           | ['display', 'sound'] | ['display']         | []                      |
| emergency | A life-threatening condition.                                                                                                      | ['display', 'sound'] | n/a                 | ['display']             |

_Reference: [Signal K Specification](https://signalk.org/specification/1.7.0/doc/data_model_metadata.html?highlight=emergency#metadata-for-a-data-value)_

### Method Mapping

`n2k-signalk` plugin processing will set the `method` to an empty array if the source identifies the Alarm as `Acknowledged` or `Silenced`.

```
n2k.temporarySilenceStatus = 'Yes' OR
n2k.acknowledgeStatus == 'Yes'
method = []
```

### Example

_Example: PGN 126983_

> path = `notifications.nmea.{alertType}.{alertCategory}.{alertSystem}.{alertId}`

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
