import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { 
  getDueJobs, 
  recordJobRun, 
  runAllCleanup,
  checkDatabaseHealth 
} from '@/db/utils';

export const dynamic = 'force-dynamic';

// Secret key to protect cron endpoints (set in environment)
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST /api/cron
 * Execute scheduled jobs - call this from external cron service
 * (e.g., Vercel Cron, Railway Cron, GitHub Actions, cron-job.org)
 * 
 * Headers required:
 * - Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    jobs: [],
  };

  try {
    // Get jobs that are due
    const dueJobs = await getDueJobs();
    
    for (const job of dueJobs) {
      const jobResult: Record<string, unknown> = {
        id: job.id,
        name: job.name,
        type: job.jobType,
      };

      const startTime = Date.now();

      try {
        // Execute job based on type
        let result: Record<string, unknown> = {};

        switch (job.jobType) {
          case 'cleanup':
            result = await runAllCleanup();
            break;

          case 'digest':
            result = await sendDailyDigest();
            break;

          case 'scrape':
            result = await triggerScrapeJobs(job.metadata as Record<string, unknown>);
            break;

          case 'health_check':
            result = await checkDatabaseHealth();
            break;

          default:
            result = { skipped: true, reason: `Unknown job type: ${job.jobType}` };
        }

        const duration = Date.now() - startTime;
        await recordJobRun(job.id, 'success', result, undefined, duration);

        jobResult.status = 'success';
        jobResult.duration = duration;
        jobResult.result = result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        await recordJobRun(job.id, 'failed', undefined, errorMessage, duration);

        jobResult.status = 'failed';
        jobResult.duration = duration;
        jobResult.error = errorMessage;
      }

      (results.jobs as unknown[]).push(jobResult);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Cron execution error:', error);
    return NextResponse.json(
      { error: 'Cron execution failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron
 * Get status of scheduled jobs
 */
export async function GET(req: NextRequest) {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  const providedSecret = authHeader?.replace('Bearer ', '');

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const jobs = await db.scheduledJob.findMany({
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      jobs: jobs.map((job: { id: string; name: string; jobType: string; schedule: string; enabled: boolean; lastRunAt: Date | null; lastStatus: string | null; nextRunAt: Date | null; runs: Array<{ id: string; status: string; startedAt: Date; duration: number | null }> }) => ({
        id: job.id,
        name: job.name,
        type: job.jobType,
        schedule: job.schedule,
        enabled: job.enabled,
        lastRunAt: job.lastRunAt,
        lastStatus: job.lastStatus,
        nextRunAt: job.nextRunAt,
        recentRuns: job.runs.map((run: { id: string; status: string; startedAt: Date; duration: number | null }) => ({
          id: run.id,
          status: run.status,
          startedAt: run.startedAt,
          duration: run.duration,
        })),
      })),
    });
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Job Implementations
// ============================================================================

async function sendDailyDigest(): Promise<Record<string, unknown>> {
  // Get users with starter tier who should receive daily digest
  const users = await db.user.findMany({
    where: {
      subscription: {
        tier: { in: ['starter', 'pro', 'elite'] },
        status: 'active',
      },
      preferences: {
        enableEmail: true,
      },
    },
    include: {
      preferences: true,
    },
  });

  // Get glitches from last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const glitches = await db.validatedGlitch.findMany({
    where: {
      isGlitch: true,
      validatedAt: { gte: yesterday },
    },
    include: { product: true },
    orderBy: { profitMargin: 'desc' },
    take: 20,
  });

  // In production: Send emails to users
  // For now, just return stats
  return {
    usersToNotify: users.length,
    glitchesFound: glitches.length,
    // emails would be sent here via Resend
  };
}

async function triggerScrapeJobs(
  metadata?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // This would trigger scraping jobs via BullMQ
  // For now, just return acknowledgment
  return {
    triggered: true,
    metadata,
  };
}
