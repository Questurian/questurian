/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
/*
 * Except for one thing, guarded by a test.
 *
 * Anonymous GraphQL is closed (shared/payload/mount-bounds.ts). Nothing in
 * this repository calls it, and one POST can carry many aliased root fields —
 * so a per-read clamp bounds each read and not the request.
 *
 * If Payload regenerates this file the wrapper disappears silently, so
 * `shared/payload/mount-bounds.test.ts` fails when the import is missing.
 */
import config from '@/payload.config'
import { GRAPHQL_POST, REST_OPTIONS } from '@payloadcms/next/routes'

import { authenticatedGraphQLOnly } from '@/shared/payload/mount-bounds'

export const POST = authenticatedGraphQLOnly(GRAPHQL_POST(config) as never) as never

export const OPTIONS = REST_OPTIONS(config)
