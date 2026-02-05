/**
 * Dining Details Collection
 * Category-specific details for dining places (restaurants, cafes, bars, etc.)
 */

import { CollectionConfig } from 'payload'

export const diningTypeOptions = [
  { label: 'Restaurant', value: 'restaurant' },
  { label: 'Fast Food', value: 'fast-food' },
  { label: 'Food Truck', value: 'food-truck' },
  { label: 'Cafe', value: 'cafe' },
  { label: 'Bar', value: 'bar' },
  { label: 'Pub', value: 'pub' },
  { label: 'Rooftop Bar', value: 'rooftop-bar' },
  { label: 'Street Food', value: 'street-food' },
  { label: 'Brewery', value: 'brewery' },
  { label: 'Winery', value: 'winery' },
  { label: 'Seafood', value: 'seafood' },
  { label: 'Italian', value: 'italian' },
  { label: 'American', value: 'american' },
  { label: 'Wine Bar', value: 'wine-bar' },
  { label: 'Cocktail Bar', value: 'cocktail-bar' },
  { label: 'Dive Bar', value: 'dive-bar' },
  { label: 'Buffet', value: 'buffet' },
  { label: 'Bakery', value: 'bakery' },
  { label: 'Dessert', value: 'dessert' },
  { label: 'Ice Cream', value: 'ice-cream' },
  { label: 'Coffee Shop', value: 'coffee-shop' },
  { label: 'Tea Shop', value: 'tea-shop' },
  { label: 'Juice Bar', value: 'juice-bar' },
  { label: 'Smoothie Bar', value: 'smoothie-bar' },
  { label: 'Pizza', value: 'pizza' },
]

export const DiningDetails: CollectionConfig = {
  slug: 'dining-details',
  labels: { singular: 'Dining Details', plural: 'Dining Details' },
  admin: {
    useAsTitle: 'type',
    defaultColumns: ['place', 'type'],
    group: 'Travel Data',
    hidden: true, // Hide from main nav - managed via Places
  },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    update: ({ req }) => req.user?.role === 'editor' || req.user?.role === 'admin',
    delete: ({ req }) => req.user?.role === 'admin',
  },
  fields: [
    {
      name: 'place',
      type: 'relationship',
      relationTo: 'places',
      required: true,
      unique: true,
      admin: { description: 'The place this detail belongs to (1:1 relationship)' },
    },
    {
      name: 'type',
      type: 'select',
      options: diningTypeOptions,
      admin: { description: 'Type of dining establishment' },
    },
  ],
}
