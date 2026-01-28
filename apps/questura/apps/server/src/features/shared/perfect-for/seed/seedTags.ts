/**
 * Seed script for Perfect For Tags
 * Run with: pnpm tsx src/features/data/perfect-for/seed/seedTags.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@/payload.config'

interface TagData {
  label: string
  category: string
  applicableTypes: string[]
  description?: string
}

const tags: TagData[] = [
  // GROUP SIZE CATEGORY
  {
    label: 'Solo Traveler',
    category: 'group-size',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Perfect for people traveling alone',
  },
  {
    label: 'Couples',
    category: 'group-size',
    applicableTypes: ['dining', 'attractions', 'accommodations'],
    description: 'Ideal for couples and romantic getaways',
  },
  {
    label: 'Small Groups',
    category: 'group-size',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Great for groups of 3-6 people',
  },
  {
    label: 'Big Groups',
    category: 'group-size',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'Accommodates groups of 7+ people',
  },
  {
    label: 'Family Friendly',
    category: 'group-size',
    applicableTypes: ['dining', 'attractions', 'accommodations'],
    description: 'Welcome and suitable for families with children',
  },
  {
    label: 'Kids Welcome',
    category: 'group-size',
    applicableTypes: ['dining', 'attractions', 'accommodations'],
    description: 'Especially welcoming to children',
  },

  // OCCASION CATEGORY
  {
    label: 'First Date',
    category: 'occasion',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Perfect atmosphere for a first date',
  },
  {
    label: 'Romantic',
    category: 'occasion',
    applicableTypes: ['dining', 'attractions', 'accommodations'],
    description: 'Ideal for romantic occasions',
  },
  {
    label: 'Birthday Celebration',
    category: 'occasion',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Great venue for birthday parties',
  },
  {
    label: 'Anniversary',
    category: 'occasion',
    applicableTypes: ['dining', 'accommodations'],
    description: 'Perfect for celebrating anniversaries',
  },
  {
    label: 'Business Meeting',
    category: 'occasion',
    applicableTypes: ['dining', 'accommodations'],
    description: 'Suitable for professional meetings',
  },
  {
    label: 'Girls Night',
    category: 'occasion',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Perfect for a night out with the girls',
  },
  {
    label: 'Guys Night',
    category: 'occasion',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Great for a guys night out',
  },
  {
    label: 'Bachelor/Bachelorette Party',
    category: 'occasion',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'Ideal for pre-wedding celebrations',
  },
  {
    label: 'Casual Hangout',
    category: 'occasion',
    applicableTypes: ['dining', 'nightlife', 'attractions'],
    description: 'Relaxed atmosphere for hanging out',
  },

  // VIBE CATEGORY
  {
    label: 'Quiet & Intimate',
    category: 'vibe',
    applicableTypes: ['dining', 'accommodations'],
    description: 'Peaceful and private atmosphere',
  },
  {
    label: 'Lively & Energetic',
    category: 'vibe',
    applicableTypes: ['dining', 'nightlife', 'attractions'],
    description: 'Vibrant and exciting atmosphere',
  },
  {
    label: 'Trendy & Hip',
    category: 'vibe',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'Modern and fashionable spot',
  },
  {
    label: 'Local & Authentic',
    category: 'vibe',
    applicableTypes: ['dining', 'attractions', 'nightlife'],
    description: 'Genuine local experience',
  },
  {
    label: 'Touristy',
    category: 'vibe',
    applicableTypes: ['dining', 'attractions', 'accommodations'],
    description: 'Popular with tourists',
  },
  {
    label: 'Upscale & Fancy',
    category: 'vibe',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'High-end and elegant',
  },
  {
    label: 'Casual & Relaxed',
    category: 'vibe',
    applicableTypes: ['dining', 'attractions', 'accommodations'],
    description: 'Laid-back and comfortable',
  },
  {
    label: 'Instagrammable',
    category: 'vibe',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Highly photogenic and shareable',
  },

  // TIME OF DAY CATEGORY
  {
    label: 'Breakfast',
    category: 'time-of-day',
    applicableTypes: ['dining'],
    description: 'Serves breakfast',
  },
  {
    label: 'Brunch',
    category: 'time-of-day',
    applicableTypes: ['dining'],
    description: 'Great brunch spot',
  },
  {
    label: 'Lunch',
    category: 'time-of-day',
    applicableTypes: ['dining'],
    description: 'Perfect for lunch',
  },
  {
    label: 'Dinner',
    category: 'time-of-day',
    applicableTypes: ['dining'],
    description: 'Excellent dinner venue',
  },
  {
    label: 'Late Night',
    category: 'time-of-day',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Open late into the night',
  },
  {
    label: 'All Day',
    category: 'time-of-day',
    applicableTypes: ['dining'],
    description: 'Open all day long',
  },

  // DIETARY CATEGORY
  {
    label: 'Vegetarian Options',
    category: 'dietary',
    applicableTypes: ['dining'],
    description: 'Has vegetarian menu items',
  },
  {
    label: 'Vegan Options',
    category: 'dietary',
    applicableTypes: ['dining'],
    description: 'Has vegan menu items',
  },
  {
    label: 'Gluten-Free Options',
    category: 'dietary',
    applicableTypes: ['dining'],
    description: 'Has gluten-free menu items',
  },
  {
    label: 'Halal',
    category: 'dietary',
    applicableTypes: ['dining'],
    description: 'Serves halal food',
  },
  {
    label: 'Kosher',
    category: 'dietary',
    applicableTypes: ['dining'],
    description: 'Serves kosher food',
  },

  // ACTIVITY LEVEL CATEGORY
  {
    label: 'Low Activity',
    category: 'activity-level',
    applicableTypes: ['attractions'],
    description: 'Minimal physical activity required',
  },
  {
    label: 'Moderate Activity',
    category: 'activity-level',
    applicableTypes: ['attractions'],
    description: 'Moderate physical activity involved',
  },
  {
    label: 'High Activity',
    category: 'activity-level',
    applicableTypes: ['attractions'],
    description: 'Requires significant physical activity',
  },
  {
    label: 'Adventure Seekers',
    category: 'activity-level',
    applicableTypes: ['attractions'],
    description: 'For thrill-seekers and adventurers',
  },
  {
    label: 'Relaxation',
    category: 'activity-level',
    applicableTypes: ['attractions', 'accommodations'],
    description: 'Perfect for relaxing and unwinding',
  },

  // BUDGET CATEGORY
  {
    label: 'Budget Friendly',
    category: 'budget',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Affordable prices',
  },
  {
    label: 'Mid-Range',
    category: 'budget',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Moderately priced',
  },
  {
    label: 'Splurge Worthy',
    category: 'budget',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Worth the extra expense',
  },
  {
    label: 'Luxury',
    category: 'budget',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'High-end luxury experience',
  },

  // SPECIAL FEATURES CATEGORY
  {
    label: 'Great Cocktails',
    category: 'special-features',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Known for excellent cocktails',
  },
  {
    label: 'Outdoor Seating',
    category: 'special-features',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'Has outdoor seating or terrace',
  },
  {
    label: 'Rooftop Views',
    category: 'special-features',
    applicableTypes: ['dining', 'nightlife', 'accommodations'],
    description: 'Features rooftop with great views',
  },
  {
    label: 'Live Music',
    category: 'special-features',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Features live music performances',
  },
  {
    label: 'Pet Friendly',
    category: 'special-features',
    applicableTypes: ['dining', 'accommodations'],
    description: 'Welcomes pets',
  },
  {
    label: 'Beach Access',
    category: 'special-features',
    applicableTypes: ['attractions', 'accommodations'],
    description: 'Direct or easy access to beach',
  },
  {
    label: 'Accessible',
    category: 'special-features',
    applicableTypes: ['dining', 'attractions', 'nightlife', 'accommodations'],
    description: 'Wheelchair accessible',
  },
  {
    label: 'Reservation Required',
    category: 'special-features',
    applicableTypes: ['dining'],
    description: 'Reservations recommended or required',
  },
  {
    label: 'Walk-ins Welcome',
    category: 'special-features',
    applicableTypes: ['dining'],
    description: 'No reservation needed',
  },
  {
    label: 'Free WiFi',
    category: 'special-features',
    applicableTypes: ['dining', 'accommodations'],
    description: 'Complimentary WiFi available',
  },
  {
    label: 'Pool',
    category: 'special-features',
    applicableTypes: ['accommodations'],
    description: 'Has a swimming pool',
  },
  {
    label: 'Spa',
    category: 'special-features',
    applicableTypes: ['accommodations'],
    description: 'Has spa facilities',
  },
  {
    label: 'Good for Dancing',
    category: 'special-features',
    applicableTypes: ['dining', 'nightlife'],
    description: 'Has a dance floor or dancing atmosphere',
  },
]

async function seedTags() {
  try {
    console.log('🌱 Starting Perfect For Tags seed...')

    // Initialize Payload
    const payloadInstance = await getPayload({ config })

    console.log('📊 Connected to database')

    // Check if tags already exist
    const existingTags = await payloadInstance.find({
      collection: 'perfect-for-tags',
      limit: 1,
    })

    if (existingTags.totalDocs > 0) {
      console.log(
        `⚠️  Found ${existingTags.totalDocs} existing tags. Do you want to continue and potentially create duplicates?`,
      )
      console.log('   To reset, delete all tags first via the admin panel.')
      console.log('   Skipping seed to prevent duplicates.')
      process.exit(0)
    }

    console.log(`📝 Creating ${tags.length} tags...`)

    let created = 0
    let failed = 0

    for (const tag of tags) {
      try {
        await payloadInstance.create({
          collection: 'perfect-for-tags',
          data: {
            ...tag,
            status: 'active',
          },
        })
        created++
        console.log(`  ✅ Created: ${tag.label} (${tag.category})`)
      } catch (error) {
        failed++
        console.error(`  ❌ Failed to create: ${tag.label}`)
        console.error(`     Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    console.log('\n' + '='.repeat(50))
    console.log(`✨ Seed complete!`)
    console.log(`   Created: ${created} tags`)
    if (failed > 0) {
      console.log(`   Failed: ${failed} tags`)
    }
    console.log('='.repeat(50))

    // Summary by category
    console.log('\n📋 Tags by category:')
    const categoryCounts: Record<string, number> = {}
    tags.forEach((tag) => {
      categoryCounts[tag.category] = (categoryCounts[tag.category] || 0) + 1
    })

    Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count} tags`)
      })

    process.exit(0)
  } catch (error) {
    console.error('❌ Seed failed:', error)
    process.exit(1)
  }
}

seedTags()
