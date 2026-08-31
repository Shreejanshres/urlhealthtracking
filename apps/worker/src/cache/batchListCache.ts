import { connection } from '../queue/connection.js';

const CACHE_KEY = 'cache:batches:list';

export async function invalidateBatchListCache(): Promise<void> {
  await connection.del(CACHE_KEY);
}