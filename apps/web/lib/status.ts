import type { BatchSummary } from '@urltracking/shared';

export function deriveBatchStatus(batch: BatchSummary): string {
  if (batch.status === 'cancelled') return 'cancelled';
  if (batch.pendingUrls > 0) return 'processing';
  return 'completed';
}