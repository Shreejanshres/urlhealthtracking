import Link from 'next/link';
import { fetchBatchList } from '@/lib/api';
import { deriveBatchStatus } from '@/lib/status';
import BatchSubmitForm from '@/components/BatchSubmitForm';

export default async function BatchListPage() {
  const { batches } = await fetchBatchList();

  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Batches</h1>
       <BatchSubmitForm />

      {batches.length === 0 && (
        <p className="text-gray-500">No batches yet.</p>
      )}

      <div className="space-y-3">
        {batches.map((batch) => {
          const status = deriveBatchStatus(batch);
          return (
            <Link
              key={batch.id}
              href={`/batches/${batch.id}`}
              className="block border rounded-lg p-4 hover:bg-gray-50"
            >
              <div className="flex justify-between items-center">
                <span className="font-mono text-sm text-gray-600">{batch.id}</span>
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
              <div className="mt-2 text-sm text-gray-500">
                {batch.completedUrls + batch.failedUrls} / {batch.totalUrls} processed
                {batch.failedUrls > 0 && (
                  <span className="text-red-500"> · {batch.failedUrls} failed</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}