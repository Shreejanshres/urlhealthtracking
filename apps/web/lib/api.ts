import type {
  BatchListResponse,
  BatchDetailResponse,
  CreateBatchResponse,
} from '@urltracking/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export async function fetchBatchList(): Promise<BatchListResponse> {
  const res = await fetch(`${API_URL}/batches`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch batches');
  return res.json();
}

export async function fetchBatchDetail(id: string): Promise<BatchDetailResponse> {
  const res = await fetch(`${API_URL}/batches/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch batch detail');
  return res.json();
}

export async function createBatch(urls: string[]): Promise<CreateBatchResponse> {
  const res = await fetch(`${API_URL}/batches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });
  if (!res.ok) throw new Error('Failed to create batch');
  return res.json();
}

export async function cancelBatch(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/batches/${id}/cancel`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to cancel batch');
}

export async function retryFailed(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/batches/${id}/retry-failed`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to retry failed URLs');
}