/**
 * Validation utilities for Express request handlers.
 */

import { ZodError, ZodSchema } from 'zod'
import type { Request, Response, NextFunction } from 'express'

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ZodError }

export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

export function formatValidationError(error: ZodError): {
  message: string
  errors: Array<{ path: string; message: string }>
} {
  return {
    message: 'Validation failed',
    errors: error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message
    }))
  }
}

export function validateBody<T>(
  schema: ZodSchema<T>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(400).json(formatValidationError(result.error))
      return
    }
    req.body = result.data
    next()
  }
}

export type { ZodSchema, ZodError } from 'zod'
