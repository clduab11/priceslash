import { NextResponse } from 'next/server';
import { db } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers
 */
export async function GET() {
  const checks: Record<string, string> = {
    app: 'running',
    database: 'unknown',
  };

  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;
    checks.database = 'connected';

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      services: checks,
    });
  } catch (error) {
    checks.database = 'disconnected';

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
        services: checks,
        error: error instanceof Error ? error.message : 'Database connection failed',
      },
      { status: 503 }
    );
  }
}
