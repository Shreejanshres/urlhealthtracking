import IORedis from 'ioredis';
import { EventEmitter } from 'node:events';

const CHANNEL = 'batch-events';

// A dedicated Redis connection just for subscribing — ioredis requires
// a separate connection for pub/sub mode, it can't share your normal client.
const subscriber = new IORedis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

export const batchEvents = new EventEmitter();
batchEvents.setMaxListeners(0); // unbounded — many SSE clients may listen

subscriber.subscribe(CHANNEL);

subscriber.on('message', (_channel, message) => {
  const event = JSON.parse(message); // { batchId, urlId, status }
  batchEvents.emit(event.batchId, event); // emit scoped to that batch's id
});