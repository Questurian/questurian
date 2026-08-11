import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'
import { triggerClientRevalidation } from './delivery'
import {
  articleRevalidationTarget,
  authorTarget,
  locationHomepageTarget,
  locationTarget,
  mergeTargets,
  redirectTarget,
} from './targets'
import type { AnyDoc } from './types'

export function revalidateArticleCollection(
  collection: 'articles' | 'single-type-listicles' | 'listicle-itineraries',
) {
  const afterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, operation }) => {
    await triggerClientRevalidation(
      mergeTargets(
        articleRevalidationTarget(collection, previousDoc as AnyDoc | undefined),
        articleRevalidationTarget(collection, doc as AnyDoc | undefined),
      ),
      `${collection}:${operation}`,
    )
  }

  const afterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
    await triggerClientRevalidation(
      articleRevalidationTarget(collection, doc as AnyDoc | undefined),
      `${collection}:delete`,
    )
  }

  return { afterChange, afterDelete }
}

// Author edits (display name, bio, avatar, social links, slug renames) must
// refresh the public author page; both old and new slug URLs are covered.
// Runs on Authors rather than Users since ADR-0007 moved the public profile
// there -- editing a staff account no longer changes what the page renders.
export const revalidateAuthorAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      authorTarget(previousDoc as AnyDoc | undefined),
      authorTarget(doc as AnyDoc | undefined),
    ),
    `authors:${operation}`,
  )
}

export const revalidateLocationHomepageAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      await locationHomepageTarget(req, previousDoc as AnyDoc | undefined),
      await locationHomepageTarget(req, doc as AnyDoc | undefined),
    ),
    `location-homepages:${operation}`,
  )
}

export const revalidateLocationHomepageAfterDelete: CollectionAfterDeleteHook = async ({
  doc,
  req,
}) => {
  await triggerClientRevalidation(
    await locationHomepageTarget(req, doc as AnyDoc | undefined),
    'location-homepages:delete',
  )
}

export const revalidateLocationAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      locationTarget(previousDoc as AnyDoc | undefined),
      locationTarget(doc as AnyDoc | undefined),
    ),
    `locations:${operation}`,
  )
}

export const revalidateLocationAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await triggerClientRevalidation(locationTarget(doc as AnyDoc | undefined), 'locations:delete')
}

export const revalidateArticleRedirectAfterChange: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
}) => {
  await triggerClientRevalidation(
    mergeTargets(
      redirectTarget(previousDoc as AnyDoc | undefined),
      redirectTarget(doc as AnyDoc | undefined),
    ),
    `article-redirects:${operation}`,
  )
}

export const revalidateArticleRedirectAfterDelete: CollectionAfterDeleteHook = async ({ doc }) => {
  await triggerClientRevalidation(
    redirectTarget(doc as AnyDoc | undefined),
    'article-redirects:delete',
  )
}
