/**
 * Health Check Endpoint
 *
 * Returns server health status, database connection, and system info
 * Used for monitoring and load balancer health checks
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { getCorsHeaders, handleCorsOptions } from '@/shared/utils/cors'

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const corsHeaders = getCorsHeaders(req)

  try {
    // Check database connection
    const payload = await getPayload({ config })

    // Simple query to verify DB is responsive
    await payload.find({
      collection: 'users',
      limit: 1,
      depth: 0,
    })

    const responseTime = Date.now() - startTime

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
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
    }, { headers: corsHeaders })
  } catch (error) {
    const responseTime = Date.now() - startTime

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        error: error instanceof Error ? error.message : 'Unknown error',
        database: {
          status: 'disconnected',
          responseTime: `${responseTime}ms`,
        },
      },
      { status: 503, headers: corsHeaders }
    )
  }
}

export async function OPTIONS(req: NextRequest) {
  return handleCorsOptions(req)
}
