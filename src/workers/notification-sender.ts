import { readStream, getKey, setKey, REDIS_KEYS } from '@/lib/clients/redis';
import { notificationManager } from '@/lib/notifications/manager';
import type { ValidatedGlitch } from '@/types';

const CURSOR_KEY = 'cursor:stream:anomaly_confirmed';
const BATCH_SIZE = Number.parseInt(process.env.STREAM_BATCH_SIZE || '50', 10);
const POLL_INTERVAL_MS = Number.parseInt(process.env.STREAM_POLL_INTERVAL_MS || '2000', 10);
const NOTIFY_DEDUP_TTL_SECONDS = Number.parseInt(process.env.NOTIFY_DEDUP_TTL_SECONDS || '86400', 10); // 24h
const MAX_RETRIES = Number.parseInt(process.env.STREAM_MAX_RETRIES || '5', 10);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function notifiedKey(glitchId: string) {
  return `dedup:notifications:${glitchId}`;
}

async function main() {
  console.log('📣 Notification sender worker starting...');
  const failures = new Map<string, number>();

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const lastId = (await getKey(CURSOR_KEY)) || '0-0';
    const entries = await readStream(REDIS_KEYS.ANOMALY_CONFIRMED, lastId, BATCH_SIZE);

    if (entries.length === 0) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    for (const entry of entries) {
      try {
        const payload = entry.fields.data;
        if (!payload) {
          console.warn(`Skipping stream entry ${entry.id}: missing data field`);
          await setKey(CURSOR_KEY, entry.id);
          continue;
        }

        const glitch = JSON.parse(payload) as ValidatedGlitch;

        const dedupKey = notifiedKey(glitch.id);
        const alreadyNotified = await getKey(dedupKey);
        if (alreadyNotified) {
          failures.delete(entry.id);
          await setKey(CURSOR_KEY, entry.id);
          continue;
        }

        const results = await notificationManager.notifyAll(glitch);
        await setKey(dedupKey, '1', NOTIFY_DEDUP_TTL_SECONDS);

        const anySuccess = Array.from(results.values()).some((r) => r.success);
        if (anySuccess) {
          try {
            const { db } = await import('@/db');
            await db.pricingAnomaly.update({
              where: { id: glitch.anomalyId },
              data: { status: 'notified' },
            });
          } catch (error) {
            console.error('Failed to mark anomaly as notified:', error);
          }
        }

        failures.delete(entry.id);
        await setKey(CURSOR_KEY, entry.id);
      } catch (error) {
        const count = (failures.get(entry.id) || 0) + 1;
        failures.set(entry.id, count);

        console.error(`Error processing confirmed glitch entry ${entry.id} (attempt ${count}/${MAX_RETRIES}):`, error);

        if (count >= MAX_RETRIES) {
          console.error(`Skipping entry ${entry.id} after ${MAX_RETRIES} failed attempts`);
          failures.delete(entry.id);
          await setKey(CURSOR_KEY, entry.id);
          continue;
        }

        // Retry this entry on next loop without advancing cursor.
        break;
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

main().catch((error) => {
  console.error('Fatal notification sender error:', error);
  process.exit(1);
});
