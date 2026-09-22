/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
/*
 * Except for one thing, guarded by a test.
 *
 * `GET` is wrapped in `boundedRestRead` (shared/payload/mount-bounds.ts):
 * anonymous reads of this mount are rate limited, clamped and admitted for
 * the whole request. Without it, globals are unbounded and the mount can
 * hold the Payload pool while /api/public/* queues behind it.
 *
 * If Payload regenerates this file the wrapper disappears silently, so
 * `shared/payload/mount-bounds.test.ts` fails when the import is missing.
 * Re-add these two lines rather than the test.
 */
import config from '@/payload.config'
import '@payloadcms/next/css'
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from '@payloadcms/next/routes'

import { boundedRestRead } from '@/shared/payload/mount-bounds'

export const GET = boundedRestRead(REST_GET(config) as never) as never
export const POST = REST_POST(config)
export const DELETE = REST_DELETE(config)
export const PATCH = REST_PATCH(config)
export const PUT = REST_PUT(config)
export const OPTIONS = REST_OPTIONS(config)
