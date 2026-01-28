import { useEffect, useState } from 'react'
import { PerfectForTag } from '../types'

export const usePerfectForData = () => {
  const [allTags, setAllTags] = useState<PerfectForTag[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchAllTags = async () => {
      try {
        const response = await fetch(
          '/api/perfect-for-tags?limit=1000&where[status][equals]=active'
        )
        const data = await response.json()
        const tags = data.docs || []
        const uniqueCategories = Array.from(
          new Set(tags.map((tag: PerfectForTag) => tag.category))
        )
        setAllTags(tags)
        setCategories(uniqueCategories as string[])
      } catch (error) {
        console.error('Error fetching tags:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchAllTags()
  }, [])

  return { allTags, categories, isLoading }
}
