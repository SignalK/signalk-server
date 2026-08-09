import { Response } from 'express'
import { writeBaseDeltasFile, writeSettingsFile } from '../../config/config'
import { GnssConfigPayload, GnssSensorsPayload } from './schemas'
import { SensorsApplication } from './index'

// Apply a gnssSensors config change to settings.json and the base-delta
// store as a single unit: on any write failure the in-memory state is
// rolled back so disk and memory stay consistent across a restart.
//
// `next === undefined` clears the config entirely (DELETE); otherwise
// `next` is written. `eventData` is forwarded on the GNSS_SENSORS
// serverevent so listeners (the corrector, WS clients) can react.
export function applyGnssSensorsAtomic(
  app: SensorsApplication,
  next: GnssConfigPayload | undefined,
  eventData: unknown,
  res: Response
): void {
  const previous: GnssConfigPayload = {
    correction: app.config.settings.gnssCorrection ?? 'off',
    sensors: app.config.settings.gnssSensors ?? []
  }
  // A synchronous throw would otherwise leave the request hanging; convert
  // it into a 500.
  try {
    runApplyGnssSensorsAtomic(app, previous, next, eventData, res)
  } catch (err) {
    console.error('Error applying gnssSensors:', err)
    if (!res.headersSent) {
      res.status(500).send('Internal error applying gnssSensors')
    }
  }
}

function runApplyGnssSensorsAtomic(
  app: SensorsApplication,
  previous: GnssConfigPayload,
  next: GnssConfigPayload | undefined,
  eventData: unknown,
  res: Response
): void {
  const de = app.config.baseDeltaEditor
  // Sweep any legacy sensors.gps.<sensorId>.fromBow/fromCenter entries
  // out of the base-delta store on every write. The corrector reads
  // offsets from settings.gnssSensors directly and no per-sensor
  // data-model entries are published, so any that exist are stale
  // leftovers.
  //
  // FullSignalK has no per-path tombstone API: removing from the base-delta
  // store stops the values from being re-emitted at startup, but any
  // entries already in `app.signalk.self` from a previous run persist
  // until the next restart. The handler reports that a restart is
  // required via legacyPathsCleared in the response so the admin UI
  // can surface the restart banner only when this actually happened.
  // Swept entries are kept so a failed write can put them back: the
  // removals live in the same in-memory editor whose baseDeltas.json
  // write failed (or never ran), and leaving them out would diverge
  // the editor from what is on disk.
  const sweptLegacyValues: Array<{ path: string; value: unknown }> = []
  const legacyPathsCleared = (rows: GnssSensorsPayload): boolean => {
    for (const s of rows) {
      for (const path of [
        `sensors.gps.${s.sensorId}.fromBow`,
        `sensors.gps.${s.sensorId}.fromCenter`
      ]) {
        const value = de.getSelfValue(path)
        if (value !== undefined) {
          de.removeSelfValue(path)
          sweptLegacyValues.push({ path, value })
        }
      }
    }
    return sweptLegacyValues.length > 0
  }
  const hadGnssSensors = Object.prototype.hasOwnProperty.call(
    app.config.settings,
    'gnssSensors'
  )
  const restorePrevious = () => {
    for (const { path, value } of sweptLegacyValues) {
      de.setSelfValue(path, value)
    }
    if (!hadGnssSensors) {
      delete app.config.settings.gnssSensors
    } else {
      app.config.settings.gnssSensors = previous.sensors
    }
    if (previous.correction === 'off') {
      delete app.config.settings.gnssCorrection
    } else {
      app.config.settings.gnssCorrection = previous.correction
    }
  }
  // Sweep ids from both the outgoing and the incoming rows: a stale
  // sensors.gps.<id> base-delta entry may predate the first row that
  // (re)uses that id, so sweeping only `previous` would let it survive
  // the save that introduces the id.
  const rowsToSweep = [
    ...new Map(
      [...previous.sensors, ...(next?.sensors ?? [])].map((s) => [
        s.sensorId,
        s
      ])
    ).values()
  ]
  let restartRequired = false
  // The in-memory mutation (base-delta sweep + settings edit) must not be
  // left half-applied: if it throws before the settings.json write starts,
  // roll back so memory matches disk, then rethrow for the caller's 500.
  try {
    if (next === undefined) {
      restartRequired = legacyPathsCleared(rowsToSweep)
      delete app.config.settings.gnssSensors
      delete app.config.settings.gnssCorrection
    } else {
      restartRequired = legacyPathsCleared(rowsToSweep)
      app.config.settings.gnssSensors = next.sensors
      if (next.correction === 'off') {
        delete app.config.settings.gnssCorrection
      } else {
        app.config.settings.gnssCorrection = next.correction
      }
    }
  } catch (err) {
    restorePrevious()
    throw err
  }
  writeSettingsFile(app, app.config.settings, (err: unknown) => {
    if (err) {
      restorePrevious()
      res.status(500).send('Unable to save gnssSensors in settings file')
      return
    }
    // Success and failure are separate arms so that only a rejected
    // base-deltas write reaches the rollback: a throwing serverevent
    // listener must not roll back settings.json after both files are
    // already on disk.
    writeBaseDeltasFile(app).then(
      () => {
        try {
          app.emit('serverevent', { type: 'GNSS_SENSORS', data: eventData })
        } catch (err) {
          console.error('GNSS_SENSORS listener error:', err)
        }
        res.json({ result: 'ok', restartRequired })
      },
      () => {
        // settings.json is already on disk with the new payload but the
        // base-deltas write failed — restore in-memory state first, then
        // re-write settings.json so disk and memory agree on a restart.
        restorePrevious()
        writeSettingsFile(app, app.config.settings, (rollbackErr: unknown) => {
          if (rollbackErr) {
            res
              .status(500)
              .send(
                'gnssSensors base-delta write failed and rolling back settings.json also failed; restart server to recover'
              )
            return
          }
          res.status(500).send('Unable to save gnssSensors base deltas')
        })
      }
    )
  })
}
