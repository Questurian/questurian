'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function AuthCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    const userParam = searchParams.get('user')
    const returnTo = searchParams.get('returnTo')

    console.log('Auth Callback Page - Token received:', !!token)
    console.log('Auth Callback Page - User data received:', !!userParam)
    console.log('Auth Callback Page - Return URL:', returnTo)

    if (token) {
      // Store the JWT token in localStorage
      localStorage.setItem('auth-token', token)
      console.log('Auth Callback Page - Token stored in localStorage')

      if (userParam) {
        try {
          const userData = JSON.parse(decodeURIComponent(userParam))
          localStorage.setItem('user-data', JSON.stringify(userData))
          console.log('Auth Callback Page - User data stored:', userData.email)
        } catch (e) {
          console.error('Auth Callback Page - Failed to parse user data:', e)
        }
      }

      // Redirect to the provided returnTo URL or default to frontend home
      // The returnTo URL is passed from the OAuth callback and should be the frontend URL
      if (returnTo) {
        console.log('Auth Callback Page - Redirecting to returnTo URL:', returnTo)
        window.location.href = returnTo
      } else {
        // Fallback to frontend home (in production: https://www.questurian.com)
        console.log('Auth Callback Page - No returnTo, redirecting to frontend home')
        window.location.href = 'https://www.questurian.com'
      }
    } else {
      console.error('Auth Callback Page - No token found, redirecting to login')
      // For errors, also redirect to frontend (localhost in dev, production URL in prod)
      const frontendUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000/login?error=missing_token'
        : 'https://www.questurian.com/login?error=missing_token'
      window.location.href = frontendUrl
    }
  }, [searchParams, router])

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h2>Completing login...</h2>
      <p>Please wait while we finish logging you in.</p>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <h2>Completing login...</h2>
        <p>Please wait while we finish logging you in.</p>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}