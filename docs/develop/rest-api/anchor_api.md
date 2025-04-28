---
title: Anchor API
---

# Anchor API

#### (Proposed)

_Note: The definition of this API is currently under development and the information provided here is likely to change._

The Signal K server Anchor API will define endpoints that can be implemented by plugins for the purposes of implementing and and operating an anchor alarm.

A plugin that implements this API must ensure that all endpoints and operations comply with the definition to ensure applications making requests receive reliable and consistent results.

The following HTTP requests are proposed:

POST `/navigation/anchor/drop` (Commence lowering of anchor)

POST `/navigation/anchor/radius` { value: number } (Set the radius of the alarm area)

POST `/navigation/anchor/reposition` { rodeLength: number, anchorDepth: number } (Calculate anchor position)

POST `/navigation/anchor/raise` (Commence raising the anchor)
