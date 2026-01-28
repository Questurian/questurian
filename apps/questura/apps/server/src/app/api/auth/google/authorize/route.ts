// this code redirects the user to google login page

//after user logs in the data is sent to reroute url link from .env

//user information is in the url via query parametes



import { NextRequest, NextResponse } from 'next/server'
import { APP_CONFIG, APP_CONFIG_WITH_GOOGLE } from '@/shared/config'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const returnTo = searchParams.get('returnTo') || '/'

  //URLSearchParams comes from Web API
  const params = new URLSearchParams({
    client_id: APP_CONFIG.google.clientId,
    redirect_uri: APP_CONFIG_WITH_GOOGLE.google.redirectUri,
    response_type: 'code',
    scope: 'openid profile email',
    access_type: 'offline',
    prompt: 'consent',
    state: encodeURIComponent(returnTo), // Store return URL in state parameter
  })

  const authUrl = `https://accounts.google.com/o/oauth2/auth?${params.toString()}`
  
  return NextResponse.redirect(authUrl)
}