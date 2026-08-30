export type BatchStatus = 'queued' | 'processing' | 'completed' | 'cancelled';
export type UrlStatus = 'pending' | 'checking' | 'succeeded' | 'failed' | 'cancelled';

export interface Batch {
  id: string;
  status: BatchStatus;
  totalUrls: number;
  completedUrls: number;
  failedUrls: number;
  createdAt: string;
  updatedAt: string;
}

export interface UrlRecord {
  id: string;
  batchId: string;
  url: string;
  status: UrlStatus;
  httpStatus: number | null;
  responseTimeMs: number | null;
  pageTitle: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}