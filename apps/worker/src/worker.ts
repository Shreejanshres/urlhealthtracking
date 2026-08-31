import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { connection } from './queue/connection.js';
import { pool } from './db/client.js';
import { checkUrl } from './service/urlChecker.js';
import { URL_CHECK_QUEUE, UrlCheckJobData } from '@urltracking/shared';
import { invalidateBatchListCache } from './cache/batchListCache.js';
import { publishUrlUpdate } from './pubsub/publisher.js';

const worker = new Worker<UrlCheckJobData>(
  URL_CHECK_QUEUE,
  async (job: Job<UrlCheckJobData>) => {
     const startedAt = Date.now();
  console.log(`[START ${new Date(startedAt).toISOString()}] ${job.data.url}`);
    const { urlId, batchId, url } = job.data;

    // Cancellation / idempotency guard
    const { rows } = await pool.query(
      `SELECT status FROM urls WHERE id = $1`,
      [urlId]
    );
    const current = rows[0]?.status;
    if (!current || current === 'cancelled' || current === 'succeeded' || current === 'failed') {
      await publishUrlUpdate(batchId, urlId, 'cancelled');
      return; // already handled or cancelled — skip work entirely
    }

    const batchRes = await pool.query(
      `SELECT status FROM batches WHERE id = $1`,
      [batchId]
    );
    if (batchRes.rows[0]?.status === 'cancelled') {
      await pool.query(`UPDATE urls SET status = 'cancelled' WHERE id = $1`, [urlId]);
      return;
    }

    await pool.query(`UPDATE urls SET status = 'checking' WHERE id = $1`, [urlId]);

    const result = await checkUrl(url); // throws -> BullMQ retries this job

    await pool.query(
      `UPDATE urls
       SET status = 'succeeded', http_status = $2, response_time_ms = $3, page_title = $4, attempts = attempts + 1
       WHERE id = $1`,
      [urlId, result.httpStatus, result.responseTimeMs, result.pageTitle]
    );
    await publishUrlUpdate(batchId, urlId, 'succeeded');
    await invalidateBatchListCache();

    console.log(`[DONE  ${new Date().toISOString()}] ${job.data.url} (${Date.now() - startedAt}ms)`);
  },
  {
    connection,
    concurrency: 5,
    limiter: { max: 10, duration: 1000 },
  }
);

worker.on('failed', async (job, err) => {
  if (!job) return;
    console.error(    `[FAILED] ${job.data.url} — attemptsMade=${job.attemptsMade}, maxAttempts=${job.opts.attempts}, error=${err.message}`
);

  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 3;

  if (attemptsMade >= maxAttempts) {
    await pool.query(
      `UPDATE urls SET status = 'failed', error = $2, attempts = attempts + 1 WHERE id = $1`,
      [job.data.urlId, err.message]
    );
    await publishUrlUpdate(job.data.batchId, job.data.urlId, 'failed');
      await invalidateBatchListCache();

  }
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

console.log('Worker started — concurrency 5, rate limit 10/sec');