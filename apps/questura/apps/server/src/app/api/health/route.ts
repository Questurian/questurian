/**
 * Health Check Endpoint
 *
 * Returns server health status, database connection, and system info.
 * Used for monitoring and load balancer health checks.
 *
 * The database probe is **sampled**, not run per request. This route is the
 * one a platform polls hardest, and it used to issue a fresh query every
 * call from every instance — so a database under pressure got a health-check
 * storm on top of the pressure, at the moment it could least afford one. The
 * result is cached for `PROBE_TTL_MS` and the response says how old it is, so
 * a reader can tell a current answer from a recent one.
 *
 * For a readiness check that costs nothing at all, use `/api/health/ready`.
 */

import { NextRequest, NextResponse } from 'next/server'
import { sampledDatabaseProbe } from '@/shared/observability/health-probe'
import { readinessState } from '@/shared/observability/readiness'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

export async function GET(req: NextRequest) {
  const corsHeaders = getCorsHeaders(req)
  const probe = await sampledDatabaseProbe()
  const readiness = readinessState()

  if (probe.ok) {
    const responseTime = probe.responseTimeMs

    return NextResponse.json({
      status: 'healthy',
      ready: readiness.ready,
      degraded: readiness.degraded,
      probeAgeMs: Date.now() - probe.at,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      releaseSha: process.env.QUESTURA_RELEASE_SHA || 'unknown',
      version: process.env.npm_package_version || 'unknown',
      database: {
        status: 'connected',
        responseTime: `${responseTime}ms`,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: {
          used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
          total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        },
      },
    }, { headers: { ...corsHeaders, 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(
    {
      status: 'unhealthy',
      ready: readiness.ready,
      probeAgeMs: Date.now() - probe.at,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      releaseSha: process.env.QUESTURA_RELEASE_SHA || 'unknown',
      error: probe.error ?? 'Unknown error',
      database: {
        status: 'disconnected',
        responseTime: `${probe.responseTimeMs}ms`,
      },
    },
    { status: 503, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } }
  )
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
