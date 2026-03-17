import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * BullMQ requires a dedicated IORedis connection per object (Queue, Worker, QueueEvents…).
 * Sharing a single instance causes blocking-command conflicts and constant reconnections.
 * Always use this factory so each BullMQ object gets its own connection.
 */
export function createRedisConnection() {
  const conn = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  conn.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  conn.on('connect', () => {
    console.log(`[Redis] Connected to ${redisUrl}`);
  });

  return conn;
}
