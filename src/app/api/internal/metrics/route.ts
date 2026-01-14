
import { NextResponse } from 'next/server';
import { metrics } from '@/lib/monitoring/metrics';
import { getDLQStats } from '@/lib/streams/dlq';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Simple auth check - use a secret header or check for admin session
  // For now, let's assume this is protected by middleware or network rules
  // But adding a basic check is good practice.
  const authHeader = req.headers.get('authorization');
  if (process.env.METRICS_SECRET && authHeader !== `Bearer ${process.env.METRICS_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [counters, dlqStats] = await Promise.all([
      metrics.getMetrics(),
      getDLQStats()
    ]);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      counters,
      dlq: dlqStats,
    });
  } catch (error) {
    console.error('Metrics endpoint error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
