/**
 * Rankings Collection
 *
 * Manages ranked lists of travel destinations with a sophisticated multi-step form workflow.
 *
 * ============================
 * WHAT THIS COLLECTION DOES
 * ============================
 *
 * The Rankings collection allows editors to create ranked lists (e.g., "Top 10 Dining in Paris")
 * by guiding them through a two-step process:
 *
 * Step 1 (Setup): Select location, ranking type, and title
 * Step 2+ (Content): Add ranked items, featured image, and publish status
 *
 * ============================
 * WHY IT'S STRUCTURED THIS WAY
 * ============================
 *
 * Multi-Step Workflow:
 * - Prevents editors from adding items before setup is complete
 * - Ensures data consistency (each ranking type has specific item types)
 * - Lowers cognitive load by breaking form into logical sections
 *
 * Hidden State Management:
 * - Uses boolean flags (step1_complete, in_update_mode) to control field visibility
 * - Flags are NOT user-facing, they control form behavior programmatically
 * - Enables complex form logic without external state managers
 *
 * Block Filtering:
 * - Rankings can contain items from specific data collections (dining, accommodations, etc.)
 * - Prevents mixing incompatible block types (dining blocks in attractions ranking)
 * - Filtering happens at both UI level (RankingsBlocksField) and database level (beforeValidate)
 *
 * ============================
 * STATE FLOW DIAGRAM
 * ============================
 *
 * Initial State:
 *   step1_complete: false
 *   in_update_mode: false
 *   ↓
 *   [Shows: Location, RankingType, Title fields, Continue button]
 *   [Hidden: Featured Image, Items, Status]
 *
 * After Click Continue (with all Step 1 fields filled):
 *   step1_complete: true
 *   in_update_mode: false
 *   ↓
 *   [Shows: Featured Image, Items (filtered), Status, Update Setup button]
 *   [Locked: Location, RankingType, Title (read-only)]
 *
 * After Click Update Setup:
 *   step1_complete: true
 *   in_update_mode: true
 *   ↓
 *   [Shows: Location, RankingType, Title fields (unlocked)]
 *   [Hidden: Featured Image, Items, Status]
 *   [Shows: Cancel Update button]
 *
 * After User Changes RankingType or Location:
 *   [Shows: Confirmation dialog: "Clear Ranking Items?"]
 *   ↓
 *   If "Clear & Continue":
 *     - Clear items array
 *     - in_update_mode: false
 *     - step1_complete: true
 *     ↓ (back to Step 2+ state with empty items)
 *   If "Keep Items":
 *     - Revert field to previous value
 *
 * ============================
 * THREE LAYERS OF VALIDATION
 * ============================
 *
 * Layer 1: UI Validation (Step1Wrapper component)
 * - User clicks Continue button
 * - Component validates all Step 1 fields are filled
 * - Shows error messages if validation fails
 * - Only proceeds if all fields present
 * Location: /src/features/articles/rankings/components/Step1Wrapper.tsx
 *
 * Layer 2: Field Locking (SmartField component)
 * - Once step1_complete = true, Step 1 fields become read-only
 * - Prevents accidental modification via form UI
 * - User must click "Update Setup" to edit again
 * Location: /src/features/articles/rankings/components/SmartField.tsx
 *
 * Layer 3: Database Validation (beforeValidate hook)
 * - On save, verify step1_complete = true
 * - Filter out any blocks that don't match ranking type
 * - Acts as safety net for API-direct mutations
 * Location: /src/features/articles/rankings/collections/Rankings.ts (this file)
 *
 * ============================
 * BLOCK FILTERING MECHANISM
 * ============================
 *
 * Problem:
 * - All 4 block types are registered (dining, accommodations, attractions, nightlife)
 * - If no filtering, user could accidentally add a "Dining" block to "Attractions" ranking
 * - This creates invalid data that violates business logic
 *
 * Solution:
 * - RankingsBlocksField component intercepts the BlocksField
 * - Reads rankingType from form state
 * - Calls getBlocksForType() to get the single matching block type
 * - Replaces the BlocksField's blocks array with only the matching block
 * - beforeValidate hook filters again on save (database-level safety net)
 *
 * Location of block definitions:
 * - Block definitions: /src/features/articles/rankings/blocks/Data*Block.ts
 * - Block filtering utility: /src/features/articles/rankings/blocks/index.ts
 * - UI filtering component: /src/features/articles/rankings/components/RankingsBlocksField.tsx
 *
 * ============================
 * FIELD ORGANIZATION
 * ============================
 *
 * State Fields (hidden):
 * - step1_complete: Toggles between Step 1 setup mode and Step 2+ content mode
 * - in_update_mode: Allows editing Step 1 fields after completion
 * - location_finalized: Reserved for future use
 *
 * Step 1 Fields (visible when step1_complete = false):
 * - location: Text field with custom LocationPickerField component
 * - rankingType: Select dropdown (dining/accommodations/attractions/nightlife)
 * - title: Text input
 * - step1UiWrapper: Render-only field with Step1Wrapper component (buttons)
 *
 * Step 2+ Fields (visible when step1_complete = true AND in_update_mode = false):
 * - headerSection: Group containing featured image and intro rich text
 * - items: Blocks field with type-based filtering
 * - status: Publish status field
 *
 * All fields defined in: /src/features/articles/rankings/collections/fields/
 */

import { CollectionConfig } from 'payload'
import { getBlocksForType } from '../blocks'
import { syncLocationFields } from '@/shared/location/server/syncLocationFields'
import {
  step1Complete,
  inUpdateMode,
  locationFinalized,
  slug,
  location,
  locationRef,
  rankingType,
  title,
  step1UiWrapper,
  headerSection,
  items,
  seo,
  status,
} from './fields'

export const Rankings: CollectionConfig = {
  slug: 'rankings',
  labels: { singular: 'Map Ranking', plural: 'Map Rankings' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'location', 'rankingType', 'status'],
    group: 'Articles',
  },
  access: {
    read: ({ req }) => {
      // Public can only read published rankings
      if (!req.user) {
        return {
          status: {
            equals: 'published',
          },
        }
      }

      // Admins, Editors, and Writers can read all rankings
      if (
        req.user.role === 'admin' ||
        req.user.role === 'editor' ||
        req.user.role === 'writer'
      ) {
        return true
      }

      return false
    },
    create: ({ req }) => {
      // Editors, admins, and writers can create
      return (
        req.user?.role === 'editor' ||
        req.user?.role === 'admin' ||
        req.user?.role === 'writer'
      )
    },
    update: ({ req, id }) => {
      const user = req.user
      if (!user) return false

      // Admins and editors can update all rankings
      if (user.role === 'admin' || user.role === 'editor') return true

      // Writers can only update their own rankings
      if (user.role === 'writer') {
        return {
          author: {
            equals: user.id,
          },
        }
      }

      return false
    },
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    // Hidden state fields for multi-step form management
    step1Complete,
    inUpdateMode,
    locationFinalized,
    slug,

    // Step 1: Initial Setup (location, rankingType, title)
    title,
    location,
    locationRef,
    rankingType,

    // Multi-step form wrapper component (render-only field with custom component)
    step1UiWrapper,

    headerSection,
    items,
    seo,
    status,
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      access: {
        update: ({ req }) => req.user?.role === 'admin' || req.user?.role === 'editor',
      },
      admin: {
        position: 'sidebar',
        description: 'Article author (auto-set to current user on creation)',
      },
      label: 'Author',
      defaultValue: ({ user }) => user?.id,
    },
  ],
  hooks: {
    /**
     * beforeChange Hook
     * Runs before data changes (create, update, read)
     * Responsibility: Generate URL-friendly slug from title
     */
    beforeChange: [
      async ({ data, req, operation }) => {
        // Set author on creation
        if (operation === 'create' && req.user?.id) {
          data.author = req.user.id
        }

        // Auto-generate slug from title
        if (data?.title && !data?.slug) {
          data.slug = data.title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '')
        }

        return data
      },
    ],

    /**
     * beforeValidate Hook
     *
     * Runs before Payload validates the document.
     * Serves as the database-level safety net (Layer 3 of validation).
     *
     * Responsibilities:
     *
     * 1. ENFORCE STEP 1 COMPLETION
     *    - On create/update operations, verify step1_complete = true
     *    - Prevents incomplete rankings from being saved
     *    - Throws error if validation fails
     *    Rationale: Ensures all rankings have location, type, and title
     *
     * 2. FILTER MISMATCHED BLOCKS
     *    - Get list of valid blocks for the ranking type: getBlocksForType()
     *    - Remove any items with blockType not in valid list
     *    - Prevents invalid block combinations from being saved
     *    - Acts as redundant check after UI filtering (RankingsBlocksField)
     *    Rationale: Protects against API mutations or client-side workarounds
     *
     * Why Two Layers of Filtering?
     * - UI Layer (RankingsBlocksField): Prevents user from accidentally adding wrong blocks
     * - DB Layer (beforeValidate): Catches any mutations that bypass UI filtering (direct API calls, etc.)
     *
     * Example Flow:
     * 1. User selects rankingType = "dining"
     * 2. RankingsBlocksField shows only DataDiningBlock
     * 3. User adds 2 dining items
     * 4. On save, beforeValidate verifies:
     *    - step1_complete = true ✓
     *    - All items have blockType = "data-dining" ✓
     * 5. Document saved successfully
     */
    beforeValidate: [
      syncLocationFields(),
      async ({ data, operation }) => {
        // Only enforce step1_complete on create/update operations (not on initial load)
        if ((operation === 'create' || operation === 'update') && !data?.step1_complete) {
          throw new Error('Please complete the initial setup: location, ranking type, and title')
        }

        // Ensure all blocks in items match the selected ranking type
        if (data?.rankingType && data?.items && Array.isArray(data.items)) {
          const validBlockSlugs = getBlocksForType(data.rankingType).map(b => b.slug)

          // Filter out any blocks that don't match the ranking type
          data.items = data.items.filter(item => {
            if (!item?.blockType || !validBlockSlugs.includes(item.blockType)) {
              console.warn(
                `Removing block type "${item?.blockType}" from ranking of type "${data.rankingType}" - block type mismatch`
              )
              return false
            }
            return true
          })
        }

        // Verify location matching for relationship items (safety net for API mutations)
        if (data?.location && data?.items && Array.isArray(data.items)) {
          const parentLocation = data.location

          console.log('[Rankings beforeValidate] Checking location matching for items')
          console.log('[Rankings beforeValidate] Parent location:', parentLocation)

          for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i]
            if (item?.item && typeof item.item !== 'string') {
              // Item is populated (has location field)
              const itemLocation = item.item.location
              console.log(`[Rankings beforeValidate] Block ${i}: item location = "${itemLocation}"`)

              if (itemLocation && itemLocation !== parentLocation) {
                console.warn(
                  `[Rankings beforeValidate] WARNING: Block ${i} has location mismatch!`,
                  `Item location: "${itemLocation}", Parent location: "${parentLocation}"`
                )
              }
            } else {
              console.log(`[Rankings beforeValidate] Block ${i}: item is ID only (not populated)`)
            }
          }
        }

        return data
      },
    ],
  },
}
