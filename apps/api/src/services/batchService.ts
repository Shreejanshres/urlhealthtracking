import {createBatchRepo} from "../repository/batchRepo.js";
import { urlCheckQueue } from "../queue/urlCheckQueue.js";
import { listBatchesRepo, getBatchByIdRepo, cancelBatchRepo, getFailedUrlsRepo, resetUrlsToQueuedRepo, reactivateBatchRepo} from '../repository/batchRepo.js';
import { invalidateBatchListCache} from '../cache/batchListCache.js';

export async function createBatch(data: string[]) {
  const urls = data
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    return {
      error: true,
      message: "At least one URL is required",
    };
  }

  const { batchId, urls: insertedUrls } = await createBatchRepo(urls);

  await urlCheckQueue.addBulk(
    insertedUrls.map((u) => ({
      name: 'check-url',
      data: { urlId: u.id, batchId, url: u.url },
      opts: { jobId: u.id },
    }))
  );
  await invalidateBatchListCache();
  return {
    error: false,
    batch_id: batchId,
    total: urls.length,
  };
}


export async function listBatches() {
  const rows = await listBatchesRepo();

  return {
    batches: rows.map((r) => ({
      id: r.id,
      status: r.status,
      totalUrls: r.total_urls,
      completedUrls: Number(r.completed_urls),
      failedUrls: Number(r.failed_urls),
      pendingUrls: Number(r.pending_urls),
      createdAt: r.created_at,
    })),
  };
}

export async function getBatchById(batchId: string) {
  const result = await getBatchByIdRepo(batchId);

  if (!result) {
    return null;
  }

  const { batch, urls } = result;

  return {
    batch: {
      id: batch.id,
      status: batch.status,
      totalUrls: batch.total_urls,
      completedUrls: Number(batch.completed_urls),
      failedUrls: Number(batch.failed_urls),
      pendingUrls: Number(batch.pending_urls),
      createdAt: batch.created_at,
    },
    urls: urls.map((u) => ({
      id: u.id,
      url: u.url,
      status: u.status,
      httpStatus: u.http_status,
      responseTime: u.response_time,
      pageTitle: u.page_title,
      error: u.error,
      attempts: u.attempts,
    })),
  };
}




// cancel batch
export async function cancelBatch(batchId: string) {
  const result = await cancelBatchRepo(batchId);

  if (!result) {
    return { error: true, message: 'Batch not found or already cancelled' };
  }

  for (const urlId of result.cancelledUrlIds) {
    try {
      const job = await urlCheckQueue.getJob(urlId);
      if (!job) continue;

      const state = await job.getState();

      if (state === 'waiting' || state === 'delayed') {
        await job.remove();
      }
    } catch (err) {
      console.warn(`Could not remove job ${urlId} from queue:`, (err as Error).message);
    }
  }
  await invalidateBatchListCache();
  return { error: false, batchId };
}

//retry failed urls
export async function retryFailedUrls(batchId: string) {
  const failedUrls = await getFailedUrlsRepo(batchId);

  if (failedUrls.length === 0) {
    return { error: true, message: 'No failed URLs to retry' };
  }

  const urlIds = failedUrls.map((u) => u.id);
  await resetUrlsToQueuedRepo(urlIds);
  await reactivateBatchRepo(batchId);

  await urlCheckQueue.addBulk(
    failedUrls.map((u) => ({
      name: 'check-url',
      data: { urlId: u.id, batchId, url: u.url },
      // new jobId so it doesn't collide with the old (now-removed) completed/failed job record
      opts: { jobId: `${u.id}:retry:${Date.now()}` },
    }))
  );
  await invalidateBatchListCache();
  return { error: false, batchId, retriedCount: urlIds.length };
}