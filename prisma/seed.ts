/**
 * Database Seed Script - Prisma 7
 * 
 * Initializes scheduled jobs for the platform.
 * Run with: npx tsx prisma/seed.ts
 */

import prismaClientPkg from '@prisma/client';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const { PrismaClient } = prismaClientPkg as unknown as {
  PrismaClient: new (options: unknown) => PrismaClientType;
};

// Database connection
const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://postgres:postgres@localhost:5432/pricing_glitch';

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ============================================================================
  // Scheduled Jobs
  // ============================================================================
  
  const jobs = [
    {
      name: 'cleanup-daily',
      jobType: 'cleanup',
      schedule: '0 3 * * *', // 3 AM daily
      metadata: {},
    },
    {
      name: 'digest-daily',
      jobType: 'digest',
      schedule: '0 8 * * *', // 8 AM daily
      metadata: {},
    },
    {
      name: 'scrape-electronics',
      jobType: 'scrape',
      schedule: '*/15 * * * *', // Every 15 minutes
      metadata: { category: 'electronics', retailers: ['amazon', 'walmart', 'bestbuy'] },
    },
    {
      name: 'scrape-home',
      jobType: 'scrape',
      schedule: '*/30 * * * *', // Every 30 minutes
      metadata: { category: 'home', retailers: ['amazon', 'walmart', 'target'] },
    },
    {
      name: 'health-check',
      jobType: 'health_check',
      schedule: '*/5 * * * *', // Every 5 minutes
      metadata: {},
    },
  ];

  for (const job of jobs) {
    await prisma.scheduledJob.upsert({
      where: { name: job.name },
      update: {
        schedule: job.schedule,
        metadata: job.metadata,
      },
      create: {
        name: job.name,
        jobType: job.jobType,
        schedule: job.schedule,
        metadata: job.metadata,
        enabled: true,
      },
    });
    console.log(`  ✓ Job: ${job.name}`);
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
