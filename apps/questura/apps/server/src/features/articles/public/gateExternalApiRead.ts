import type { CollectionAfterReadHook } from 'payload'

import { staffUser } from '@/features/auth/lib/staff-user'
import { isGatedItem } from '@/shared/content/accessTier'

import { applySampleRule } from './freeSample'
import type { ArticleCollectionSlug } from './serializeArticleBlocks'

/**
 * Applies the Sample rule to Gated items leaving the **external** API surface:
 * Payload's own REST (`/api/<collection>`) and GraphQL mounts.
 *
 * ADR-0009 puts enforcement at serialization time because every route in
 * `/api/public/*` reads with `overrideAccess: true`, so collection access
 * control cannot gate those. That reasoning is correct and unchanged -- but it
 * only ever enumerated *this app's* routes. Payload mounts its own REST and
 * GraphQL endpoints for every collection, they are published on
 * `cms.questurian.com` because the client needs that host, and on that path
 * `access.read` is the only gate and no serializer runs. Anonymous
 * `GET /api/articles?where[access][equals]=member` returned complete paid
 * bodies until 2026-08-16.
 *
 * `access.read` now refuses anonymous reads on both paid collections, which is
 * the actual fix. This hook is the second layer: it survives someone loosening
 * that rule for a relationship picker, and it covers a non-staff principal that
 * does hold a session.
 *
 * Scoped to REST and GraphQL on purpose, rather than "not local":
 *
 * - Hooks run even under `overrideAccess: true`, so an unscoped version would
 *   truncate the full body that `/api/public/articles/full` serves to an
 *   entitled member -- the lockout bug ADR-0009 exists to avoid, and the one
 *   that generates refunds.
 * - Internal read-modify-write callers (editorial pipelines, sync jobs) would
 *   read a sampled `contentBlocks` and write it back, destroying the locked
 *   remainder in the database.
 * - A fabricated `req` with no `payloadAPI` therefore has to fail open. The
 *   surface being closed is the one reachable from the internet, and that
 *   surface always carries a `payloadAPI` of `REST` or `GraphQL`.
 *
 * No `gate` marker is attached here. That shape is the contract of the public
 * reader routes, which compute `shown`/`total` from the untouched document;
 * emitting a half-populated copy of it on a surface no reader client uses
 * would create a second, wrong notion of the same thing.
 */
export function gateExternalApiRead(collection: ArticleCollectionSlug): CollectionAfterReadHook {
  return ({ doc, req }) => {
    if (req.payloadAPI !== 'REST' && req.payloadAPI !== 'GraphQL') return doc
    if (staffUser(req.user)) return doc
    if (!isGatedItem(doc)) return doc

    applySampleRule(collection, doc as Record<string, unknown>)

    return doc
  }
}
