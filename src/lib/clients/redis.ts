import { Redis as UpstashRedis } from '@upstash/redis';
import { createClient } from 'redis';

type NodeRedisClient = ReturnType<typeof createClient>;

type RedisBackend =
  | { kind: 'upstash'; client: UpstashRedis }
  | { kind: 'node'; client: NodeRedisClient }
  | { kind: 'none' };

let cachedBackend: RedisBackend | undefined;

async function getBackend(): Promise<RedisBackend> {
  if (cachedBackend) return cachedBackend;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      cachedBackend = { kind: 'upstash', client: new UpstashRedis({ url: upstashUrl, token: upstashToken }) };
      return cachedBackend;
    } catch (error) {
      console.warn('Failed to initialize Upstash Redis client:', error);
    }
  } else if (process.env.NODE_ENV !== 'production') {
    console.warn('Upstash Redis environment variables not configured');
  }

  const redisUrl =
    process.env.REDIS_URL ||
    (process.env.REDIS_HOST && process.env.REDIS_PORT
      ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
      : undefined);

  if (!redisUrl) {
    cachedBackend = { kind: 'none' };
    return cachedBackend;
  }

  const client = createClient({ url: redisUrl });
  client.on('error', (error) => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Redis client error:', error);
    }
  });

  try {
    await client.connect();
    cachedBackend = { kind: 'node', client };
    return cachedBackend;
  } catch (error) {
    console.warn('Failed to connect to Redis:', error);
    cachedBackend = { kind: 'none' };
    return cachedBackend;
  }
}

export interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

function toFieldsObject(rawFields: unknown): Record<string, string> {
  if (rawFields && typeof rawFields === 'object' && !Array.isArray(rawFields)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawFields as Record<string, unknown>)) {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
  }

  if (Array.isArray(rawFields)) {
    const out: Record<string, string> = {};
    for (let i = 0; i < rawFields.length; i += 2) {
      const key = rawFields[i];
      const value = rawFields[i + 1];
      if (key === undefined) continue;
      out[String(key)] = value === undefined ? '' : String(value);
    }
    return out;
  }

  return {};
}

function normalizeXReadResponse(raw: unknown): StreamEntry[] {
  if (!Array.isArray(raw)) return [];

  const entries: StreamEntry[] = [];

  for (const streamEntry of raw) {
    if (!Array.isArray(streamEntry) || streamEntry.length < 2) continue;

    const messages = streamEntry[1];
    if (!Array.isArray(messages)) continue;

    for (const message of messages) {
      if (!Array.isArray(message) || message.length < 2) continue;
      const id = String(message[0]);
      const fields = toFieldsObject(message[1]);
      entries.push({ id, fields });
    }
  }

  return entries;
}

// Redis stream keys
export const REDIS_KEYS = {
  ANOMALY_DETECTED: 'price:anomaly:detected',
  ANOMALY_CONFIRMED: 'price:anomaly:confirmed',
  NOTIFICATION_PENDING: 'notification:pending',
  DEDUP_SET: 'dedup:products',
} as const;

// Publish anomaly to Redis stream
export async function publishAnomaly(anomalyId: string, data: Record<string, unknown>): Promise<void> {
  const backend = await getBackend();
  if (backend.kind === 'none') return;

  const fields = {
    id: anomalyId,
    data: JSON.stringify(data),
    timestamp: new Date().toISOString(),
  };

  if (backend.kind === 'upstash') {
    await backend.client.xadd(REDIS_KEYS.ANOMALY_DETECTED, '*', fields);
    return;
  }

  await backend.client.xAdd(REDIS_KEYS.ANOMALY_DETECTED, '*', fields);
}

// Publish confirmed glitch to Redis stream
export async function publishConfirmedGlitch(glitchId: string, data: Record<string, unknown>): Promise<void> {
  const backend = await getBackend();
  if (backend.kind === 'none') return;

  const fields = {
    id: glitchId,
    data: JSON.stringify(data),
    timestamp: new Date().toISOString(),
  };

  if (backend.kind === 'upstash') {
    await backend.client.xadd(REDIS_KEYS.ANOMALY_CONFIRMED, '*', fields);
    return;
  }

  await backend.client.xAdd(REDIS_KEYS.ANOMALY_CONFIRMED, '*', fields);
}

export async function publishNotificationPending(glitchId: string, data: Record<string, unknown>): Promise<void> {
  const backend = await getBackend();
  if (backend.kind === 'none') return;

  const fields = {
    id: glitchId,
    data: JSON.stringify(data),
    timestamp: new Date().toISOString(),
  };

  if (backend.kind === 'upstash') {
    await backend.client.xadd(REDIS_KEYS.NOTIFICATION_PENDING, '*', fields);
    return;
  }

  await backend.client.xAdd(REDIS_KEYS.NOTIFICATION_PENDING, '*', fields);
}

export async function readStream(streamKey: string, lastId: string, count = 50): Promise<StreamEntry[]> {
  const backend = await getBackend();
  if (backend.kind === 'none') return [];

  if (backend.kind === 'upstash') {
    const raw = await backend.client.xread(streamKey, lastId, { count });
    return normalizeXReadResponse(raw);
  }

  const command = ['XREAD', 'COUNT', String(count), 'STREAMS', streamKey, lastId] as const;
  const raw = await backend.client.sendCommand(command as unknown as string[]);
  return normalizeXReadResponse(raw);
}

export async function getKey(key: string): Promise<string | null> {
  const backend = await getBackend();
  if (backend.kind === 'none') return null;

  const value = await (backend.kind === 'upstash' ? backend.client.get<string>(key) : backend.client.get(key));
  return value ?? null;
}

export async function setKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const backend = await getBackend();
  if (backend.kind === 'none') return;

  if (backend.kind === 'upstash') {
    await backend.client.set(key, value, ttlSeconds ? { ex: ttlSeconds } : undefined);
    return;
  }

  await backend.client.set(key, value, ttlSeconds ? { EX: ttlSeconds } : undefined);
}

// Check if product URL was recently processed (deduplication)
export async function isRecentlyProcessed(productUrl: string, ttlSeconds = 300): Promise<boolean> {
  const key = `${REDIS_KEYS.DEDUP_SET}:${Buffer.from(productUrl).toString('base64')}`;
  return isRecentlyProcessedKey(key, ttlSeconds);
}

export async function isRecentlyProcessedKey(key: string, ttlSeconds = 300): Promise<boolean> {
  const backend = await getBackend();
  if (backend.kind === 'none') return false;

  const exists = await (backend.kind === 'upstash' ? backend.client.exists(key) : backend.client.exists(key));

  if (!exists) {
    await setKey(key, '1', ttlSeconds);
    return false;
  }

  return true;
}

export async function pushToList(key: string, value: string): Promise<void> {
  const backend = await getBackend();
  if (backend.kind === 'none') return;

  if (backend.kind === 'upstash') {
    await backend.client.lpush(key, value);
    return;
  }
  await backend.client.lPush(key, value);
}

export async function getListLength(key: string): Promise<number> {
  const backend = await getBackend();
  if (backend.kind === 'none') return 0;

  if (backend.kind === 'upstash') {
    return await backend.client.llen(key);
  }
  return await backend.client.lLen(key);
}

export async function getKeys(pattern: string): Promise<string[]> {
  const backend = await getBackend();
  if (backend.kind === 'none') return [];

  if (backend.kind === 'upstash') {
    return await backend.client.keys(pattern);
  }
  return await backend.client.keys(pattern);
}

export async function incrementKey(key: string): Promise<number> {
  const backend = await getBackend();
  if (backend.kind === 'none') return 0;

  if (backend.kind === 'upstash') {
    return await backend.client.incr(key);
  }
  return await backend.client.incr(key);
}
