import { pool } from "../db/client.js";

export async function createBatchRepo(urls: string[]) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const batchId = crypto.randomUUID();

    await client.query(
      `
      INSERT INTO batches (
        id,
        status,
        total_urls
      )
      VALUES ($1, $2, $3)
      `,
      [batchId, "queued", urls.length],
    );

    const insertedUrls: { id: string; url: string }[] = [];

    for (const url of urls) {
      const urlId = crypto.randomUUID();

      await client.query(
        `
        INSERT INTO urls (
          id,
          batch_id,
          url,
          status
        )
        VALUES ($1, $2, $3, $4)
        `,
        [urlId, batchId, url, "queued"],
      );

      insertedUrls.push({ id: urlId, url });
    }

    await client.query("COMMIT");

    return { batchId, urls: insertedUrls };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}