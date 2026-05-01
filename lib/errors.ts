// Tiny error helpers for API routes. Wraps a thrown HttpError into a JSON
// Response inside route handlers via withErrorHandling().

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export class HttpError extends Error {
  status: number
  code: string
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (msg = 'Bad request', details?: unknown) =>
  new HttpError(400, 'bad_request', msg, details)
export const unauthorized = (msg = 'Unauthorized') =>
  new HttpError(401, 'unauthorized', msg)
export const forbidden = (msg = 'Forbidden') =>
  new HttpError(403, 'forbidden', msg)
export const notFound = (msg = 'Not found') =>
  new HttpError(404, 'not_found', msg)
export const conflict = (msg = 'Conflict') => new HttpError(409, 'conflict', msg)
export const serverError = (msg = 'Server error', details?: unknown) =>
  new HttpError(500, 'server_error', msg, details)

export function jsonError(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    )
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Validation failed',
          details: err.flatten(),
        },
      },
      { status: 400 },
    )
  }
  // Don't leak internals.
  console.error('[api] unhandled error', err)
  return NextResponse.json(
    { error: { code: 'server_error', message: 'Internal server error' } },
    { status: 500 },
  )
}

export async function withErrorHandling<T>(
  fn: () => Promise<NextResponse<T>>,
): Promise<NextResponse> {
  try {
    return await fn()
  } catch (err) {
    return jsonError(err)
  }
}
