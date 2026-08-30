import {createBatchRepo} from "../repository/batchRepo.js";
import { urlCheckQueue } from "../queue/urlCheckQueue.js";

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

  return {
    error: false,
    batch_id: batchId,
    total: urls.length,
  };
}

