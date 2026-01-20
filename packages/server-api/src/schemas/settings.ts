/**
 * Server settings validation schemas for REST API boundaries.
 */

import { z } from 'zod'

const SettingsOptionsSchema = z
  .object({
    mdns: z.boolean().optional(),
    ssl: z.boolean().optional(),
    wsCompression: z.boolean().optional(),
    accessLogging: z.boolean().optional(),
    enablePluginLogging: z.boolean().optional(),
    trustProxy: z.union([z.boolean(), z.string()]).optional()
  })
  .passthrough()

const CourseApiSettingsSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.string(), z.number()])
)

export const ServerSettingsSchema = z
  .object({
    interfaces: z.record(z.string(), z.boolean()).optional(),
    options: SettingsOptionsSchema.optional(),
    port: z.coerce.number().int().min(1).max(65535).optional(),
    sslport: z.coerce.number().int().min(1).max(65535).optional(),
    loggingDirectory: z.string().optional(),
    pruneContextsMinutes: z.coerce.number().int().min(0).optional(),
    keepMostRecentLogsOnly: z.boolean().optional(),
    logCountToKeep: z.coerce.number().int().min(1).optional(),
    courseApi: CourseApiSettingsSchema.optional()
  })
  .passthrough()

export type ServerSettings = z.infer<typeof ServerSettingsSchema>
