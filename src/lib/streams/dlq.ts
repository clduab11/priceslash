
import { pushToList, getKeys, getListLength } from '@/lib/clients/redis';

export const DLQ_RETENTION_SECONDS = 7 * 24 * 60 * 60; // 7 days

export async function moveToDLQ(
  originalStreamKey: string,
  entryId: string,
  payload: any,
  error: any
): Promise<void> {
  const dlqKey = `dlq:${originalStreamKey}`;
  
  const dlqEntry = {
    original_stream: originalStreamKey,
    original_id: entryId,
    payload,
    error: error instanceof Error ? error.message : String(error),
    failed_at: new Date().toISOString(),
  };

  try {
    await pushToList(dlqKey, JSON.stringify(dlqEntry));
    console.log(`[DLQ] Moved failed entry ${entryId} from ${originalStreamKey} to ${dlqKey}`);
  } catch (err) {
    console.error(`[DLQ] FATAL: Failed to move entry to DLQ`, err);
  }
}

export async function getDLQStats(): Promise<Record<string, number>> {
    const keys = await getKeys('dlq:*');
    const stats: Record<string, number> = {};
    
    for (const key of keys) {
        const count = await getListLength(key);
        stats[key] = count;
    }
    
    return stats;
}
