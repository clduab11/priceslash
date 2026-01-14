
import { incrementKey, getKeys, getKey as getRedisKey } from '@/lib/clients/redis';

export class MetricsService {
  
  async increment(name: string, tags: Record<string, string> = {}): Promise<void> {
    const key = this.buildKey(name, tags);
    try {
      await incrementKey(key);
    } catch (err) {
      console.warn('Failed to increment metric:', err);
    }
  }

  async getMetrics(): Promise<Record<string, number>> {
    try {
      const keys = await getKeys('metrics:*');
      const stats: Record<string, number> = {};
      
      // Note: This is O(N) where N is number of metrics. 
      // In production, use MGET or pipelining if possible.
      for (const key of keys) {
        const val = await getRedisKey(key);
        if (val) stats[key] = parseInt(val, 10);
      }
      return stats;
    } catch (err) {
      console.error('Failed to get metrics:', err);
      return {};
    }
  }

  private buildKey(name: string, tags: Record<string, string>): string {
    const tagString = Object.entries(tags)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}=${v}`)
      .join(':');
    
    // Format: metrics:name:tag1=val1:tag2=val2
    return `metrics:${name}${tagString ? ':' + tagString : ''}`;
  }
}

export const metrics = new MetricsService();
