export interface PerfectForTag {
  id: number | string
  label: string
  slug: string
  category: string
  applicableTypes: string[]
  description?: string
  status: 'active' | 'archived'
  usageCount?: number
}

export interface PerfectForPickerFieldProps {
  path: string
  applicableType?: 'dining' | 'attractions' | 'nightlife' | 'accommodations'
}
