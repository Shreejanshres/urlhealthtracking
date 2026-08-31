'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBatch } from '@/lib/api';

export default function BatchSubmitForm() {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submitUrls(urls: string[]) {
    if (urls.length === 0) {
      setError('Enter at least one URL');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await createBatch(urls);
      router.push(`/batches/${result.batchId}`);
    } catch {
      setError('Failed to create batch');
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const urls = text.split('\n').map((l) => l.trim()).filter(Boolean);
    submitUrls(urls);
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      // naive CSV parse: one URL per line, or first column if comma-separated
      const urls = content
        .split('\n')
        .map((line) => line.split(',')[0].trim())
        .filter(Boolean);
      submitUrls(urls);
    };
    reader.readAsText(file);
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 border rounded-lg p-4 space-y-3">
      <div>
        <label className="block text-sm font-medium mb-2">
          Paste URLs (one per line)
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="w-full border rounded p-2 text-sm font-mono"
          placeholder="https://google.com&#10;https://github.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Or upload a CSV</label>
        <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-black text-white px-4 py-2 rounded text-sm disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Batch'}
      </button>
    </form>
  );
}