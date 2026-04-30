'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLoginModalStore } from '@/lib/stores/loginModalStore'
import { getOAuthErrorMessage } from '../lib/oauthErrorMessages'

export function useOAuthErrorModal(countrySlug: string, citySlug: string) {
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const openLoginModal = useLoginModalStore((state) => state.openLoginModal)

  useEffect(() => {
    const error = searchParams.get('error')
    const email = searchParams.get('email')
    if (!error && !email) return

    openLoginModal({
      title: 'Sign In',
      subtitle: 'Please sign in to continue',
      errorMessage: getOAuthErrorMessage(error),
      prefillEmail: email || undefined,
    })

    router.replace(`/${countrySlug}/${citySlug}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, citySlug, countrySlug])
}
