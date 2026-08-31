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


export async function listBatchesRepo() {
  const { rows } = await pool.query(`
    SELECT
      b.id,
      b.status,
      b.total_urls,
      COUNT(u.id) FILTER (WHERE u.status = 'succeeded') AS completed_urls,
      COUNT(u.id) FILTER (WHERE u.status = 'failed')    AS failed_urls,
      COUNT(u.id) FILTER (WHERE u.status IN ('queued', 'checking')) AS pending_urls,
      b.created_at
    FROM batches b
    LEFT JOIN urls u ON u.batch_id = b.id
    GROUP BY b.id
    ORDER BY b.created_at DESC
    LIMIT 50
  `);
  return rows;
}

export async function getBatchByIdRepo(batchId: string) {
  const batchResult = await pool.query(
    `
    SELECT
      b.id,
      b.status,
      b.total_urls,
      COUNT(u.id) FILTER (WHERE u.status = 'succeeded') AS completed_urls,
      COUNT(u.id) FILTER (WHERE u.status = 'failed')    AS failed_urls,
      COUNT(u.id) FILTER (WHERE u.status IN ('queued', 'checking')) AS pending_urls,
      b.created_at
    FROM batches b
    LEFT JOIN urls u ON u.batch_id = b.id
    WHERE b.id = $1
    GROUP BY b.id
    `,
    [batchId]
  );

  if (batchResult.rows.length === 0) {
    return null;
  }

  const urlsResult = await pool.query(
    `
    SELECT id, url, status, http_status, response_time_ms, page_title, error, attempts
    FROM urls
    WHERE batch_id = $1
    ORDER BY created_at ASC
    `,
    [batchId]
  );

  return {
    batch: batchResult.rows[0],
    urls: urlsResult.rows,
  };
}


export async function cancelBatchRepo(batchId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const batchRes = await client.query(
      `UPDATE batches SET status = 'cancelled' WHERE id = $1 AND status != 'cancelled' RETURNING id`,
      [batchId]
    );

    if (batchRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null; 
    }

  
    const urlsRes = await client.query(
      `UPDATE urls SET status = 'cancelled'
       WHERE batch_id = $1 AND status IN ('queued', 'checking')
       RETURNING id`,
      [batchId]
    );

    await client.query('COMMIT');
    return { batchId, cancelledUrlIds: urlsRes.rows.map((r) => r.id) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}


export async function getFailedUrlsRepo(batchId: string) {
  const { rows } = await pool.query(
    `SELECT id, url FROM urls WHERE batch_id = $1 AND status = 'failed'`,
    [batchId]
  );
  return rows;
}

export async function resetUrlsToQueuedRepo(urlIds: string[]) {
  if (urlIds.length === 0) return;
  await pool.query(
    `UPDATE urls SET status = 'queued', error = NULL, attempts = 0 WHERE id = ANY($1::uuid[])`,
    [urlIds]
  );
}

export async function reactivateBatchRepo(batchId: string) {
  // if the batch had finished/been marked cancelled, bring it back to queued/processing
  await pool.query(
    `UPDATE batches SET status = 'queued' WHERE id = $1`,
    [batchId]
  );
}