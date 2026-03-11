import { Queue } from 'bullmq';
import { connection } from '../config/redis.js';

export const generationQueue = new Queue('blog-generation', { connection });
