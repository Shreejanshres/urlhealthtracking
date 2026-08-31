import { pool } from '../db/client.js';

export async function updateBatchProgress(batchId: string) {
  // Count current terminal-state urls for this batch
  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'succeeded') AS completed,
      COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
      COUNT(*) FILTER (WHERE status IN ('queued', 'checking')) AS pending,
      COUNT(*) AS total
    FROM urls
    WHERE batch_id = $1
    `,
    [batchId]
  );

  const { completed, failed, pending, total } = rows[0];

  // Don't overwrite a batch that was explicitly cancelled
  const batchRes = await pool.query(`SELECT status FROM batches WHERE id = $1`, [batchId]);
  const currentStatus = batchRes.rows[0]?.status;
  if (currentStatus === 'cancelled') return;

  const newStatus = Number(pending) === 0 ? 'completed' : 'processing';

  await pool.query(
    `UPDATE batches
     SET completed_urls = $2, failed_urls = $3, status = $4, updated_at = now()
     WHERE id = $1`,
    [batchId, completed, failed, newStatus]
  );
}