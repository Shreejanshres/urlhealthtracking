import Fastify from "fastify";
import { checkDatabaseConnection } from "./db/client.js";
import { createBatch } from "./services/batchService.js"; 

const app = Fastify({
  logger: true,
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


