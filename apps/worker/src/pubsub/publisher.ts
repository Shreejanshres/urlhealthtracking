import { connection } from '../queue/connection.js';

const CHANNEL = 'batch-events';

export async function publishUrlUpdate(batchId: string, urlId: string, status: string) {
  await connection.publish(CHANNEL, JSON.stringify({ batchId, urlId, status }));
}