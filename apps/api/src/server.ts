import Fastify from "fastify";
import cors from '@fastify/cors';

import { checkDatabaseConnection } from "./db/client.js";
import { createBatch, listBatches, getBatchById,cancelBatch,retryFailedUrls } from "./services/batchService.js"; 
import { getCachedBatchList, setCachedBatchList } from './cache/batchListCache.js';
import { batchEvents } from './pubsub/subscriber.js';

const app = Fastify({
  logger: true,
});

await app.register(cors, {
  origin: 'http://localhost:3000',
  credentials: true,
});

const start = async () => {
  try { 
    await checkDatabaseConnection();

    await app.listen({
      port: 3001,
      host: "0.0.0.0",
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();

app.post("/batches", async (request, reply) => {
  const body = request.body as {
    urls?: unknown;
  };

  console.log(body);

  if (!Array.isArray(body.urls)) {
    return reply.status(400).send({
      error: "urls must be an array",
    });
  }

  const batch = await createBatch(body.urls);
  
  if(batch.error){
     return reply.status(400).send({
      error: batch.message,
    });
  }

  return reply.status(201).send({
    batchId: batch.batch_id,
    totalUrls: batch.total,
  });
});

app.get('/batches', async (request, reply) => {
  const cached = await getCachedBatchList();
  if (cached) {
    reply.header('X-Cache', 'HIT'); // useful for you to visually confirm caching works
    return reply.status(200).send(JSON.parse(cached));
  }

  const result = await listBatches();
  await setCachedBatchList(result);

  reply.header('X-Cache', 'MISS');
  return reply.status(200).send(result);
});

app.get('/batches/:id', async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = await getBatchById(id);

  if (!result) {
    return reply.status(404).send({ error: 'Batch not found' });
  }

  return reply.status(200).send(result);
});



app.post('/batches/:id/cancel', async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = await cancelBatch(id);

  if (result.error) {
    return reply.status(404).send({ error: result.message });
  }

  return reply.status(200).send({ batchId: result.batchId, status: 'cancelled' });
});


// retry

app.post('/batches/:id/retry-failed', async (request, reply) => {
  const { id } = request.params as { id: string };
  const result = await retryFailedUrls(id);

  if (result.error) {
    return reply.status(400).send({ error: result.message });
  }

  return reply.status(200).send({ batchId: result.batchId, retriedCount: result.retriedCount });
});

app.get('/batches/:id/events', async (request, reply) => {
  const { id: batchId } = request.params as { id: string };

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:3000',
  });

  const send = (data: unknown) => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // initial event so the client knows the connection is live
  send({ type: 'connected', batchId });

  const listener = (event: { urlId: string; status: string }) => {
    send({ type: 'url-update', ...event });
  };

  batchEvents.on(batchId, listener);

  // heartbeat to keep the connection alive through proxies/load balancers
  const heartbeat = setInterval(() => {
    reply.raw.write(': heartbeat\n\n');
  }, 15000);

  request.raw.on('close', () => {
    clearInterval(heartbeat);
    batchEvents.off(batchId, listener);
  });
});