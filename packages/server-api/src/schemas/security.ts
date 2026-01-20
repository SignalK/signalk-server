/**
 * Security-related validation schemas for REST API boundaries.
 */

import { z } from 'zod'

export const UserSchema = z.object({
  type: z.enum(['admin', 'readonly']),
  password: z.string().min(1).optional()
})

export type User = z.infer<typeof UserSchema>

export const PasswordChangeSchema = z
  .string()
  .min(1, 'Password cannot be empty')

export type PasswordChange = z.infer<typeof PasswordChangeSchema>

export const DeviceAccessRequestSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  description: z.string().min(1, 'Description is required'),
  permissions: z.enum(['readonly', 'readwrite', 'admin']).optional()
})

export const UserAccessRequestSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  password: z.string().min(1, 'Password is required'),
  permissions: z.enum(['readonly', 'readwrite', 'admin']).optional()
})

/**
 * Access request - either device (clientId + description) or user (userId + password).
 */
export const AccessRequestSchema = z.union([
  DeviceAccessRequestSchema,
  UserAccessRequestSchema
])

export type AccessRequest = z.infer<typeof AccessRequestSchema>

export const AccessRequestStatusUpdateSchema = z
  .object({
    expiration: z.string().optional(),
    permissions: z.enum(['readonly', 'readwrite', 'admin']).optional()
  })
  .passthrough()

export type AccessRequestStatusUpdate = z.infer<
  typeof AccessRequestStatusUpdateSchema
>

export const DeviceUpdateSchema = z
  .object({
    description: z.string().optional(),
    permissions: z.enum(['readonly', 'readwrite', 'admin']).optional()
  })
  .passthrough()

export type DeviceUpdate = z.infer<typeof DeviceUpdateSchema>

export const SecurityConfigSchema = z
  .object({
    expiration: z.string().optional(),
    allowDeviceAccessRequests: z.boolean().optional(),
    allowNewUserRegistration: z.boolean().optional(),
    allow_readonly: z.boolean().optional(),
    immutableConfig: z.boolean().optional(),
    adminUIOrigin: z.string().optional(),
    acls: z
      .array(
        z.object({
          context: z.string(),
          resources: z.array(
            z.object({
              paths: z.array(z.string()).optional(),
              sources: z.array(z.string()).optional(),
              permissions: z
                .array(
                  z.object({
                    subject: z.string(),
                    permission: z.enum(['read', 'write', 'put'])
                  })
                )
                .optional()
            })
          )
        })
      )
      .optional()
  })
  .passthrough()

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>
