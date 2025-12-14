import { NextRequest, NextResponse } from 'next/server';
import { 
  runAllCleanup, 
  checkDatabaseHealth,
  cleanupPriceHistory,
  cleanupJobRuns,
  cleanupAuditLogs,
  cleanupApiUsage,
} from '@/db/utils';

export const dynamic = 'force-dynamic';

// Admin secret for maintenance endpoints
const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Validate admin authorization
 */
function validateAuth(req: NextRequest): boolean {
  if (!ADMIN_SECRET) return true; // Skip auth if not configured (dev mode)
  
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');
  return providedSecret === ADMIN_SECRET;
}

/**
 * POST /api/admin/maintenance
 * Run maintenance tasks manually
 */
export async function POST(req: NextRequest) {
  if (!validateAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const task = body.task || 'all';

    let result: Record<string, unknown>;

    switch (task) {
      case 'all':
        result = await runAllCleanup();
        break;
      case 'price_history':
        result = await cleanupPriceHistory(body.daysToKeep);
        break;
      case 'job_runs':
        result = await cleanupJobRuns(body.daysToKeep);
        break;
      case 'audit_logs':
        result = await cleanupAuditLogs(body.daysToKeep);
        break;
      case 'api_usage':
        result = await cleanupApiUsage(body.hoursToKeep);
        break;
      default:
        return NextResponse.json(
          { error: `Unknown task: ${task}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      task,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Maintenance error:', error);
    return NextResponse.json(
      { error: 'Maintenance task failed', message: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/maintenance
 * Get database health and statistics
 */
export async function GET(req: NextRequest) {
  if (!validateAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const health = await checkDatabaseHealth();

    // Get table statistics (approximate counts for performance)
    const [
      userCount,
      subscriptionCount,
      productCount,
      glitchCount,
      notificationCount,
    ] = await Promise.all([
      prismaCount('users'),
      prismaCount('subscriptions'),
      prismaCount('products'),
      prismaCount('validated_glitches'),
      prismaCount('notifications'),
    ]);

    return NextResponse.json({
      database: health,
      statistics: {
        users: userCount,
        subscriptions: subscriptionCount,
        products: productCount,
        validatedGlitches: glitchCount,
        notifications: notificationCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (_error) {
    return NextResponse.json(
      { error: 'Health check failed' },
      { status: 500 }
    );
  }
}

/**
 * Get approximate row count from PostgreSQL statistics
 * Much faster than COUNT(*) for large tables
 */
async function prismaCount(tableName: string): Promise<number> {
  const { db } = await import('@/db');
  
  try {
    const result = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT reltuples::bigint AS count FROM pg_class WHERE relname = $1`,
      tableName
    );
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
