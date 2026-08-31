import { connection } from '../queue/connection.js'; // reuse your existing ioredis client

const CACHE_KEY = 'cache:batches:list';
const TTL_SECONDS = 30;

export async function getCachedBatchList(): Promise<string | null> {
  return connection.get(CACHE_KEY);
}

export async function setCachedBatchList(data: unknown): Promise<void> {
  await connection.set(CACHE_KEY, JSON.stringify(data), 'EX', TTL_SECONDS);
}

export async function invalidateBatchListCache(): Promise<void> {
  await connection.del(CACHE_KEY);
}