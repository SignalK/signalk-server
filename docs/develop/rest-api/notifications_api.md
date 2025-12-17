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
