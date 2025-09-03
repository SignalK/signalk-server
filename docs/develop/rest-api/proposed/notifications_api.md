---
title: Notifications API
---

# Notifications API

#### (Under Development)

_Note: This API is currently under development and the information provided here is likely to change._

The Signal K server Notifications API will provide a set of operations for raising, actioning and clearing notifications.

It will implement:

- Both HTTP endpoints for interactive use (`/signalk/v2/api/notifications`) and an interface for use by plugins and connection handlers to ensure effective management of notifications.

- The ability to action notifications (e.g. acknowledge, silence, etc) and preserve the resulting status so it is available to all connected devices.

- A unique `id` for each notification which can then be used to action it, regardless of the notification source.

[View the PR](https://github.com/SignalK/signalk-server/pull/1560) for more details.
