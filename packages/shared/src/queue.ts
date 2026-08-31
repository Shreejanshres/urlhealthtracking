export const URL_CHECK_QUEUE = 'url-check';

export interface UrlCheckJobData {
  urlId: string;
  batchId: string;
  url: string;
}

export interface UrlCheckResult {
  httpStatus: number;
  responseTimeMs: number;
  pageTitle: string | null;
}