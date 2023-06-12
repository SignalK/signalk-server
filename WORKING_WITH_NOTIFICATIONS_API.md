# Working with the Notifications API


## Overview

The SignalK Notifications API provides the ability to raise and action notifications / alarms using `HTTP` requests.

The API provides endpoints at the following path `/signalk/v2/api/notifications`.

**See the [OpenAPI documentation](https://demo.signalk.io/admin/openapi/) in the Signal K server Admin UI (under Documentation) for details.**

---

## Operation

The Notifications API manages the raising, actioning and clearing of notifications.

It does this by providing:
1. HTTP endpoints for interactive use 
1. An Interface for use by plugins and connection handlers.

In this way, notifications triggered by both stream data and client interactions are consistently represented in the Signal K data model and that actions (e.g. acknowledge, silence, etc) and their resulting status is preseved and available to all connected devices.

Additionally, the Notifications API applies a unique `id` to each notification which can be used in as an alternative to the `path` and `$source` to identify a notification entry.


## Using the API Plugin Interface
---

The Notifications API exposes the `notify()` method for use by plugins for raising, updating and clearing notifications.

**`app.notify(path, value, sourceId)`**

  - `path`: Signal K path of the notification

  - `value`: A valid `Notification` object or `null` if clearing a notification.

  - `sourceId` The source identifier associated with the notification.
  

To raise (create) a new notification or update and existing notification call the method with a valid `Notification` object as the `value`.

- returns:  `string` value containing the `id` of the new / updated notification.

_Example: Raise notification_
```javascript
const alarmId = app.notify(
  'myalarm', 
  {
	message: 'My alarm text',
	state: 'alert'
  },
  'myAlarmPlugin'
)

// alarmId = "ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a"
```

To clear (cancel) a notification call the method with `null` as the `value`.

- returns:  `void`.

_Example: Clear notification_
```javascript
const alarmId = app.notify(
  'myalarm', 
  null,
  'myAlarmPlugin'
)
```

## Using HTTP Endpoints
---

### Raising a Notification

To create (or raise) a notification you submit a HTTP `PUT` request to the specified `path` under `/signalk/v2/api/notifications`.  

_Example: Raise notification_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/notifications/myalarm' {
  "message": "My alarm text.",
  "state": "alert"
}
```

You can also provide additional data values associated with the alarm.

_Example: Raise notification with temperature values_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/notifications/myalarm' {
  "message": "My alarm text.",
  "state": "alert",
  "data": {
    "temperature": {
      "outside": 293.5,
      "inside": 289.7
    }
  }
}
```

If the action is successful, a response containing the `id` of the notification is generated.

_Example response:_
```JSON
{
  "state": "COMPLETED",
  "statusCode": 201,
  "id": "ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a"
}
```

This `id` can be used to perform actions on the notification.


### Updating notification content
---

To update the information contained in a notification, you need to replace it by submitting another `HTTP PUT` request containing a the new values.

You can either use the notification `path` or `id` to update it.

_Example: Update notification by path_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/notifications/myalarm' {
  "message": "New alarm text.",
  "state": "warning"
}
```

_Example: Update notification by id_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/notifications/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a' {
  "message": "New alarm text.",
  "state": "warning"
}
```

### Clear a notification
---

To clear or cancel a notification submit a `HTTP DELETE` request to either the notification `path` or `id`.

_Example: Clear notification by path_
```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/notifications/myalarm'
```

_Example: Clear notification by id_
```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/notifications/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
```

Additionally, you can clear a notification with a specific `$source` by providing the source value as a query parameter.

_Example: Clear notification by path created by `zone-watch`_
```typescript
HTTP DELETE 'http://hostname:3000/signalk/v2/api/notifications/enteredZone?source=zone-watch'
```

### Acknowledge a notification
---

To acknowledge a notification, submit a `HTTP PUT` request to `http://hostname:3000/signalk/v2/api/notifications/ack/<notification_path_or_id>`.

This adds the **`actions`** property to the notification which holds a list of actions taken on the notification. "ACK" will be added to the list of actions when a notificationis acknowledged.

```
{
  ...
  "actions": ["ACK"],
  ...
}
```

_Example: Acknowledge notification using a path_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/notifications/ack/myalarm'
```

_Example: Acknowledge notification using an id_
```typescript
HTTP PUT 'http://hostname:3000/signalk/v2/api/notifications/ack/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
```

_Acknowledged notification response._
```JSON
{
  "message": "Man Overboard!",
  "method": [
    "sound",
    "visual"
  ],
  "actions": ["ACK"],
  "state": "emergency",
  "id": "96171e52-38de-45d9-aa32-30633553f58d",
  "data": {
    "position": {
      "longitude": -166.18340908333334,
      "latitude": 60.03309133333333
    }
  }
}
```

### Standard Alarms
---

Standard alarms, such as Man Overboard, can be raised submitting a HTTP `POST` request to the specified `alarm path`.  

These alarms will be raised by the server with pre-defined content.


_Example: Raise Man Overboard Alarm_
```typescript
HTTP POST 'http://hostname:3000/signalk/v2/api/notifications/mob'
```

_Notification content._
```JSON
{
  "message": "Man Overboard!",
  "method": [
    "sound",
    "visual"
  ],
  "state": "emergency",
  "id": "96171e52-38de-45d9-aa32-30633553f58d",
  "data": {
    "position": {
      "longitude": -166.18340908333334,
      "latitude": 60.03309133333333
    }
  }
}
```

## View / List notifications
---

### View a specified notification
To view a specific notification submit a `HTTP GET` request to either the notification `path` or `id`.

_Example: Retrieve notification by path_
```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/notifications/myalarm'
```

_Example: Retrieve notification by id_
```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/notifications/ac3a3b2d-07e8-4f25-92bc-98e7c92f7f1a'
```

_Response: Includes `path` attribute associated with the notification._
```JSON
{
		"meta": {},
		"value": {
			"message": "My test alarm!",
			"method": ["sound", "visual"],
			"state": "alert",
			"id": "d3f1be57-2672-4c4d-8dc1-0978dea7a8d6",
			"data": {
				"position": {
					"lat": 12,
					"lon": 148
				}
			}
		},
		"$source": "notificationsApi",
		"timestamp": "2023-06-08T07:52:52.459Z",
		"path": "notifications.myalarm"
	}
```

_Example: Retrieve notification by path with the specified $source_
```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/notifications/myalarm?source=zone-watch'
```

### View a list notifications
A list of notifications generated using the Notifications API and be retrieved by submitting a `HTTP GET` request to `http://hostname:3000/signalk/v2/api/notifications`.

By default the list of notification objects will be keyed by their `path`.

_Example: Notification list keyed by path (default)_
```JSON
{
	"notifications.myalarm": {
		"value": {
			"message": "My test alarm!",
			"method": ["sound", "visual"],
			"state": "alert",
			"id": "d3f1be57-2672-4c4d-8dc1-0978dea7a8d6",
		},
		"$source": "notificationsApi",
		"timestamp": "2023-06-08T07:52:52.459Z"
	},
	"notifications.mob": {
		"value": {
			"message": "Man Overboard!",
			"method": ["sound", "visual"],
			"state": "emergency",
			"id": "ff105ae9-43d5-4039-abaf-afeefb03566e",
			"data": {
				"position": "No vessel position data."
			}
		},
		"$source": "notificationsApi",
		"timestamp": "2023-06-08T07:52:54.124Z"
	}
}
```

To view a list of notifications keyed by their identifier, add `key=id` to the request.

```typescript
HTTP GET 'http://hostname:3000/signalk/v2/api/notifications?key=id`
```

```JSON
{
	"d3f1be57-2672-4c4d-8dc1-0978dea7a8d6": {
		"value": {
			"message": "My test alarm!",
			"method": ["sound", "visual"],
			"state": "alert",
			"id": "d3f1be57-2672-4c4d-8dc1-0978dea7a8d6",
			"data": {
				"position": {
					"lat": 12,
					"lon": 148
				}
			}
		},
		"$source": "notificationsApi",
		"timestamp": "2023-06-08T07:52:52.459Z",
		"path": "notifications.myalarm"
	},
	"ff105ae9-43d5-4039-abaf-afeefb03566e": {
		"value": {
			"message": "Man Overboard!",
			"method": ["sound", "visual"],
			"state": "emergency",
			"id": "ff105ae9-43d5-4039-abaf-afeefb03566e",
			"data": {
				"position": "No vessel position data."
			}
		},
		"$source": "notificationsApi",
		"timestamp": "2023-06-08T07:52:54.124Z",
		"path": "notifications.mob"
	}
}
```
