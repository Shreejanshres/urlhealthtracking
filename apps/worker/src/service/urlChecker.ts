import { UrlCheckResult } from '@urltracking/shared';


export async function checkUrl(url: string): Promise<UrlCheckResult> {
  const start = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    const responseTimeMs = Date.now() - start;

    let pageTitle: string | null = null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) {
      const html = await res.text();
      const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      pageTitle = match ? match[1].trim() : null;
    }

    return {
      httpStatus: res.status,
      responseTimeMs,
      pageTitle,
    };
  }catch (err) {
    if (err instanceof Error) {
        console.error('checkUrl error:', err.message, (err as any).cause);
    }
    throw err;
}  finally {
    clearTimeout(timeout);
  }
}