import { Queue } from 'bullmq';
import { connection } from './connection';
import { URL_CHECK_QUEUE, UrlCheckJobData } from '@urltracking/shared';

export const urlCheckQueue = new Queue<UrlCheckJobData>(URL_CHECK_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }, // 2s -> 4s -> 8s
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  },
});