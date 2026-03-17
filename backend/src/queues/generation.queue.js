import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';

export const generationQueue = new Queue('blog-generation', { connection: createRedisConnection() });
