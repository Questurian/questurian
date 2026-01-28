#!/usr/bin/env node

/**
 * Cleanup Script: Normalize Admin/Editor Membership Fields (JavaScript version)
 *
 * This script ensures all admin/editor users have hard-locked membership fields:
 * - subscriptionStatus: 'active' (permanent)
 * - membershipExpiration: null (no expiration)
 * - subscriptionRenewsAt: null (no renewal)
 * - cancelAtPeriodEnd: false (never cancelling)
 * - stripeCustomerId: null (no Stripe integration)
 * - stripeSubscriptionId: null (no Stripe integration)
 *
 * Usage:
 *   node scripts/normalize-staff-membership.js
 */

const path = require('path')
const configPath = path.resolve(__dirname, '../src/payload.config.ts')

async function normalizeAdminEditorUsers() {
  console.log('🛡️ Starting staff membership normalization...\n')

  try {
    // Import the payload config dynamically
    const { getPayload } = require('payload')
    const payloadConfig = require(configPath).default

    const payload = await getPayload({ config: payloadConfig })

    // Find all admin/editor users
    const staffUsers = await payload.find({
      collection: 'users',
      where: {
        role: { in: ['admin', 'editor'] }
      }
    })

    if (staffUsers.docs.length === 0) {
      console.log('✅ No staff members found to normalize')
      process.exit(0)
      return
    }

    console.log(`Found ${staffUsers.docs.length} staff members to normalize\n`)

    let updated = 0
    let skipped = 0
    const errors = []

    for (const user of staffUsers.docs) {
      const needsUpdate =
        user.subscriptionStatus !== 'active' ||
        user.membershipExpiration !== null ||
        user.cancelAtPeriodEnd !== false ||
        user.stripeCustomerId !== null ||
        user.stripeSubscriptionId !== null

      if (!needsUpdate) {
        console.log(`✅ Already normalized: ${user.email} (${user.role})`)
        skipped++
        continue
      }

      try {
        await payload.update({
          collection: 'users',
          id: user.id,
          data: {
            subscriptionStatus: 'active',
            membershipExpiration: null,
            subscriptionRenewsAt: null,
            cancelAtPeriodEnd: false,
            stripeCustomerId: null,
            stripeSubscriptionId: null
          }
        })

        console.log(`🔧 Updated: ${user.email} (${user.role})`)
        updated++
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.error(`❌ Failed to update ${user.email}:`, errorMessage)
        errors.push({
          email: user.email,
          error: errorMessage
        })
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Normalization Summary:')
    console.log('='.repeat(60))
    console.log(`✅ Updated: ${updated}`)
    console.log(`⏭️  Skipped (already normalized): ${skipped}`)
    console.log(`❌ Failed: ${errors.length}`)

    if (errors.length > 0) {
      console.log('\n⚠️ Errors:')
      errors.forEach(({ email, error }) => {
        console.log(`   - ${email}: ${error}`)
      })
      process.exit(1)
    }

    console.log('\n✅ Staff membership normalization complete!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Fatal error during normalization:', error)
    process.exit(1)
  }
}

normalizeAdminEditorUsers()
