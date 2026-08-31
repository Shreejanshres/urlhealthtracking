'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { fetchBatchDetail, cancelBatch, retryFailed } from '@/lib/api';
import { deriveBatchStatus } from '@/lib/status';
import type { BatchDetailResponse } from '@urltracking/shared';

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<BatchDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await fetchBatchDetail(id);
      setData(result);
    } catch {
      setError('Failed to load batch');
    }
  }, [id]);

  useEffect(() => {
    refresh(); // initial load — works correctly on a cold open

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const source = new EventSource(`${apiUrl}/batches/${id}/events`);

    source.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      if (parsed.type === 'url-update' || parsed.type === 'batch-complete') {
        refresh(); // re-fetch authoritative state from Postgres, don't trust the event payload directly
      }
    };

    source.onerror = () => {
      // EventSource auto-reconnects by default; we don't need to handle
      // reconnection manually. If the batch already finished server-side
      // sent a batch-complete and closed cleanly, this won't fire.
    };

    return () => {
      source.close();
    };
  }, [id, refresh]);

  async function handleCancel() {
    setActionLoading(true);
    try {
      await cancelBatch(id);
      await refresh();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRetry() {
    setActionLoading(true);
    try {
      await retryFailed(id);
      await refresh();
    } finally {
      setActionLoading(false);
    }
  }

  if (error) return <main className="p-8 text-red-500">{error}</main>;
  if (!data) return <main className="p-8 text-gray-500">Loading...</main>;

  const { batch, urls } = data;
  console.log(urls);
  const status = deriveBatchStatus(batch);
  const processed = batch.completedUrls + batch.failedUrls;

  return (
    <main className=" p-8">
      <a href="/" className="text-sm text-gray-500 hover:underline">← All batches</a>

      <div className="flex justify-between items-center mt-4 mb-2">
        <h1 className="text-xl font-bold font-mono">{batch.id}</h1>
        <span
          className={`text-xs px-2 py-1 rounded ${
            status === 'completed'
              ? 'bg-green-100 text-green-700'
              : status === 'cancelled'
              ? 'bg-gray-200 text-gray-600'
              : 'bg-blue-100 text-blue-700'
          }`}
        >
          {status}
        </span>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {processed} / {batch.totalUrls} processed
        {batch.failedUrls > 0 && <span className="text-red-500"> · {batch.failedUrls} failed</span>}
      </p>

      <div className="flex gap-2 mb-6">
        {status === 'processing' && (
          <button
            onClick={handleCancel}
            disabled={actionLoading}
            className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel Batch
          </button>
        )}
        {batch.failedUrls > 0 && (
          <button
            onClick={handleRetry}
            disabled={actionLoading}
            className="text-sm px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50"
          >
            Retry Failed
          </button>
        )}
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2">URL</th>
            <th className="py-2">Status</th>
            <th className="py-2">HTTP</th>
            <th className="py-2">Time</th>
            <th className="py-2">Title</th>
          </tr>
        </thead>
        <tbody>
          {urls.map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2 truncate max-w-[200px]">{u.url}</td>
              <td className="py-2">{u.status}</td>
              <td className="py-2">{u.httpStatus ?? '—'}</td>
              <td className="py-2">{u.resonse_time ? `${u.resonse_time}ms` : '—'}</td>
              <td className="py-2 truncate max-w-[200px]">{u.pageTitle ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}