/**
 * Vessel data validation schemas for REST API boundaries.
 */

import { z } from 'zod'

const numericInput = z.union([z.number(), z.string()]).optional()

export const VesselSchema = z
  .object({
    name: z.string().optional(),
    mmsi: z.string().optional(),
    uuid: z.string().optional(),
    draft: numericInput,
    length: numericInput,
    beam: numericInput,
    height: numericInput,
    gpsFromBow: numericInput,
    gpsFromCenter: numericInput,
    aisShipType: numericInput,
    callsignVhf: z.string().optional()
  })
  .passthrough()

export type Vessel = z.infer<typeof VesselSchema>
