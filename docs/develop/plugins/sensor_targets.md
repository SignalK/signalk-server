---
title: Sensor Targets
---

# Sensor targets

AIS, radar ARPA and camera detection each see some of the same boats. AIS vessels are `vessels.*` contexts. Objects that other sensors track are contexts under `targets.*`, so they are ordinary Signal K data: REST, WebSocket subscriptions, history and every plugin see them with no extra API.

Three kinds of plugin take part:

- **Sensor plugins** publish what their sensor tracks under `targets.*`.
- **A fusion plugin** decides which contexts are the same object and publishes that as a `sameAs` link.
- **Consumers** such as collision alarms and chart plotters read `vessels.*` and `targets.*` and follow the links, so a boat several sensors see is shown or alarmed once.

## Publishing targets

Publish each tracked object as a delta in its own context:

```
targets.<type>:<id>
```

- `<type>` is the kind of sensor, e.g. `radar` or `camera`. AIS is not published here; it stays under `vessels.*`.
- `<id>` must be unique for that sensor type and must not contain a `.`. Include something unique to your plugin or device, e.g. a radar id and the radar's target number.
- Use the paths vessels use: `navigation.position`, `navigation.courseOverGroundTrue`, `navigation.speedOverGround` and `navigation.headingTrue`. When the sensor itself has identified the vessel (a camera reading the hull, a radar matching its AIS overlay), also set `name` or `mmsi` at the root of the context.
- Stamp each update with the time of the observation.
- When the sensor loses a track, publish `null` for `navigation.position`. A context that stops updating is removed from the data model by the server's context pruning, the same as an inactive vessel (_Server → Settings → Maximum age of inactive vessels' data_).

```javascript
app.handleMessage(plugin.id, {
  context: 'targets.radar:nav1034A-17',
  updates: [
    {
      timestamp: '2026-10-05T17:20:01.000Z',
      values: [
        {
          path: 'navigation.position',
          value: { latitude: 52.0182, longitude: 4.0001 }
        },
        { path: 'navigation.courseOverGroundTrue', value: 3.14 },
        { path: 'navigation.speedOverGround', value: 5.2 }
      ]
    }
  ]
})
```

## Linking targets

When a fusion plugin decides that a target is the same object as another context, it sets `sameAs` on the target to that context:

```javascript
app.handleMessage(plugin.id, {
  context: 'targets.radar:nav1034A-17',
  updates: [
    {
      values: [{ path: 'sameAs', value: 'vessels.urn:mrn:imo:mmsi:244060000' }]
    }
  ]
})
```

- A link points at the context that names the object: the AIS vessel when AIS sees it, otherwise one target of the group. Links never chain.
- Publish `null` to withdraw a link.
- Run one fusion plugin at a time; two would publish conflicting links.

## Reading targets

Subscribe to `vessels.*` and `targets.*`. Each context without a `sameAs` is one object. Its position is the most recent of its own and those of the targets that link to it, so a boat keeps its vessel identity while a radar still tracks it after its AIS falls silent. Ignore a target whose position is `null` or more than a minute old.
