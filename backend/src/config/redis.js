import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

connection.on('connect', () => {
  console.log(`[Redis] Connected to ${redisUrl}`);
});

export { connection };
