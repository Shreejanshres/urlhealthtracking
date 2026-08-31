export type BatchStatus = 'queued' | 'processing' | 'completed' | 'cancelled';
export type UrlStatus = 'pending' | 'checking' | 'succeeded' | 'failed' | 'cancelled';

export interface BatchSummary {
  id: string;
  status: string;
  totalUrls: number;
  completedUrls: number;   // succeeded
  failedUrls: number;
  pendingUrls: number;     // queued + checking
  createdAt: string;
}

export interface BatchListResponse {
  batches: BatchSummary[];
}

export interface UrlResult {
  id: string;
  url: string;
  status: string;
  httpStatus: number | null;
  responseTime: number | null;
  pageTitle: string | null;
  error: string | null;
  attempts: number;
}

export interface BatchDetailResponse {
  batch: BatchSummary;
  urls: UrlResult[];
}