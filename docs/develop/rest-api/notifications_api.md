---
title: Notifications API
---

# Notifications API

The Notifications API enables the raising, actioning and centralised management of Signal K notifications and their associated alarms.

## Overview

Notifications are a special type Signal K update delta that convey the occurrence of an event or change in condition.

They contain a `path` value that starts with the text `notifications` and a payload with specific attributes to indicate:

- The severity of the event / condition (`state`)
- How the event / condition should be indicated to the operator (`method`)
- What actions can be / have been taken (`status`)

### Terminology

> The Signal K specification uses the terms `notification` and `alarm` interchangably, whilst Signal K Server assigns notification deltas originating from NMEA2000 alarm PGNs with atrributes with the term `alert`.

For consistency and clarity this document will use the the following terminology:

- `notification` - A Signal K update delta message with a path starting with the text _notifications._
- `alarm` - The communication of the event / condition to the operator.

### Initial Release

The initial release of the Notifications API implements core functionality to attribute Signal K notifications to allow them to be actioned and managed, regardless of their source.
It does this by:

- Placing notifications into their own update
- Assigning them a unique identifier
- Adding a `status` attribute to the payload
- Making available HTTP endpoints at `/signalk/v2/api/notifications` to perform actions.

> **Note:** Actions are only available for notifications containing a payload containing `state` and `method` attributes.

### Target State

Subsequent releases of Signal K server will contain enhancements to the **Notification API** to implement the remaining functionality including:

- Creating and clearing notifications
- Managing Alarm lifecycle
- Raising specified alarms i.e. MOB
- Plugin interface

## Notification Payload

The Notification API adds the following attributes to the notification payload:

- `id` - Unique identifier for use when taking action.
- `status` - An object detailing the actions that can be and have been taken.

_Example_

```json
{
 "state": "...",
 "method": [..],
 "message": "...",
 "id": "a987be59-d26f-46db-afeb-83987b837a8f",
 "status": {
      "silenced": true,
      "acknowledged": false,
      "canSilence": true,
      "canAcknow;edge": true,
      "canClear": true
   }
}
```

### Notification Status

The `status` attribute is added to all notifications that have a payload containing `state` and `method` attributes.

The following status properties indicate the actions that **CAN be taken**. Their values are determined by the notification's `state` attribute:

- `canSilence` - indicates whether the Alarm associated with this notification can be silenced
- `canAcknowledge` - indicates whether the Alarm associated with this notification can be acknowledged
- `canClear` - Indicates that the associated Alarm can be cleared (triggering condition has been resolved). _The value is `false` when the notification is not originated by the Notifcations API._

The remaining properties indicate the actions that **HAVE been taken**:

- `silenced` - `true` when silence action has been taken
- `acknowledged` - `true` when acknowledge action has been taken

## Taking Action

To take action on the alarm associated with a notification, send an HTTP POST request to `/signalk/v2/api/notifications/{notificationId}/{action}`.

### Silencing an Alarm

> Note: The silence action is only available for alarms associated with notifications having `status.canSilence` = `true`.

To silence the alarm send an HTTP POST request to `/signalk/v2/api/notifications/{notificationId}/silence`.

The result of a successful silence request is that the:

- `sound` value is removed from the `method` attribute
- `status.silenced` is set to `true`

If the silence action is requested when the `status.canSilence` property is `false`, the alarm will not be silenced and an ERROR response is returned to the requestor.

> **Note:** Notifications with `state = emergency` cannot be silenced regardless of the value of `status.canSilence`.

_Example: Notification payload prior to `silence` action request._

```JSON
{
   "message": "Engine temperature is high!",
   "method": ["sound", "visual"],
   "state": "alert",
   "id": "a987be59-d26f-46db-afeb-83987b837a8f",
   "status": {
      "silenced": false,
      "acknowledged": false,
      "canSilence": true,
      "canAcknowledge": true,
      "canClear": true
   }
}
```

_Silence action request_

```typescript
HTTP POST "/signalk/v2/api/notifications/a987be59-d26f-46db-afeb-83987b837a8f/silence"
```

_Notification: post `silence` request_

```JSON
{
   "message": "Engine temperature is high!",
   "method": ["visual"],
   "state": "alert",
   "id": "a987be59-d26f-46db-afeb-83987b837a8f",
   "status": {
      "silenced": true,
      "acknowledged": false,
      "canSilence": true,
      "canAcknow;edge": true,
      "canClear": true
   }
}
```

### Acknowledging an Alarm

> Note: The acknowledge action is only available for alarms associated with notifications having `status.canAcknowledge` = `true`.

To acknowledge the alarm send an HTTP POST request to `/signalk/v2/api/notifications/{notificationId}/acknowledge`.

The result of a successful acknowledge request is that the:

- Both `sound` & `visual` values are removed from the `method` attribute
- `status.acknowledged` is set to `true`

If the acknowledge action is requested when the `status.canAcknowledge` property is `false`, the alarm will not be acknowledged and an ERROR response is returned to the requestor.

> **Note:** Notifications with `state = emergency` will only have the `sound` value removed from `method`.

_Example: Notification prior to `acknowledge` request._

```JSON
{
   "message": "Engine temperature is high!",
   "method": ["sound", "visual"],
   "state": "alert",
   "id": "a987be59-d26f-46db-afeb-83987b837a8f",
   "status": {
      "silenced": true,
      "acknowledged": false,
      "canSilence": true,
      "canAcknow;edge": true,
      "canClear": true
   }
}
```

_Acknowledge action request_

```typescript
HTTP POST "/signalk/v2/api/notifications/a987be59-d26f-46db-afeb-83987b837a8f/acknowledge"
```

_Notification: post `acknowledge` request_

```JSON
{
   "message": "Engine temperature is high!",
   "method": [],
   "state": "alert",
   "id": "a987be59-d26f-46db-afeb-83987b837a8f",
   "status": {
      "silenced": true,
      "acknowledged": true,
      "canSilence": true,
      "canAcknow;edge": true,
      "canClear": true
   }
}
```

## NMEA2000 Alert Handling

NMEA2000 alarm PGNs are processed by `n2k-signalk` which generates Signal K notification deltas as follows:

- Path value starting with `notifications.nmea.*`
- PGN fields mapped to the `state`, `method` and `message` attributes
- Additional attributes capturing PGN field values added to the notification payload.

The **Notification API** uses these additional PGN attributes to populate the notification `status` to align the available actions and any action taken.

_Example: Signal K notification from NMEA2000 Alarm PGN_

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

### NMEA2000 -> Signal K `state` Mapping

NMEA2000 alarm states are mapped to Signal K notification `state` as follows:

| NMEA2000 State  | Signal K State | Description                                                                                                                        |
| --------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Emergency Alarm | `emergency`    | A life-threatening condition                                                                                                       |
| Alarm           | `alarm`        | Immediate action is required to prevent loss of life or equipment damage                                                           |
| Warning         | `warn`         | Indicates a condition that requires immediate attention but not immediate action                                                   |
| Caution         | `alert`        | Indicates a safe or normal condition which is brought to the operators attention to impart information for routine action purposes |
| --              | `normal`       | Indicates normal operation.                                                                                                        |
| --              | `nominal`      | This is can be used to indicate value has entered a range within the normal zone                                                   |

_Reference: [Signal K Specification](https://signalk.org/specification/1.7.0/doc/data_model_metadata.html?highlight=emergency#metadata-for-a-data-value)_

### NMEA2000 alarm `method` Mapping

The `n2k-signalk` plugin will set a notification's `method = []` when the NMEA2000 `acknowledgeStatus` OR `temporarySilenceStatus` attributes are set to **"Yes"**.

The **Notifications API** will re-write the `method` attribute value, as outlined above in [Silencing a Notification](#silencing-a-notification) and [Acknowledging a Notification](#acknowledging-a-notification), to ensure alignment across all notifications regardless of source.
