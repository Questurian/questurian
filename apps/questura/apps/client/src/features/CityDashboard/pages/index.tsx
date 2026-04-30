'use client'

import { useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useProtectedRoute } from '@/lib/routing'
import { useLoginModalStore } from '@/lib/stores/loginModalStore'
import { useLocationStore } from '@/lib/stores/locationStore'
import { useOAuthErrorModal } from '../hooks/useOAuthErrorModal'
import type { CityDashboardProps } from '../types'

function CityDashboardContent({ citySlug, countrySlug }: CityDashboardProps) {
  const router = useRouter()
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal)
  const setLastVisited = useLocationStore((state) => state.setLastVisited)

  useEffect(() => {
    setLastVisited({ cityId: citySlug, country: countrySlug })
  }, [citySlug, countrySlug, setLastVisited])

  useProtectedRoute({
    onLoginRequired: (redirectPath) => {
      openLoginModal({
        title: 'Sign in required',
        subtitle: 'Please sign in to access your account',
        onSuccess: () => router.push(redirectPath),
      })
    },
  })

  useOAuthErrorModal(countrySlug, citySlug)

  return null
}

export function CityDashboardPage({ citySlug, countrySlug }: CityDashboardProps) {
  return (
    <Suspense fallback={null}>
      <CityDashboardContent citySlug={citySlug} countrySlug={countrySlug} />
    </Suspense>
  )
}
