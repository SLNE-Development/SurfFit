import {
  assertTopology,
  connect,
  consumerGroups,
  createLogger,
  loadEnv,
  startConsumers,
  startOutboxRelay,
} from "@surffit/core";
import { createDb } from "@surffit/db";
import { startHealthServer } from "./health";
import { parseWorkerQueues } from "./queues";

async function main() {
  const env = loadEnv();
  const logger = createLogger("worker");

  const db = createDb(env.DATABASE_URL);
  const connection = await connect(env.RABBITMQ_URL);
  const channel = await connection.createConfirmChannel();
  await assertTopology(channel);

  const groups = parseWorkerQueues(env.WORKER_QUEUES, Object.keys(consumerGroups));
  const consumers = await startConsumers(connection, groups);
  const relay = startOutboxRelay({ db, channel });

  const port = env.PORT ? Number(env.PORT) : 3001;
  const healthServer = startHealthServer({ db, connection, port });

  logger.info({ groups }, "worker started");

  let shuttingDown = false;

  async function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;

    const timeout = setTimeout(() => {
      logger.error("graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 10_000);

    try {
      await relay.stop();
      await consumers.stop();
      await channel.close();
      await connection.close();
      await db.$client.end();
      healthServer.close();
      clearTimeout(timeout);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, "error during shutdown");
      clearTimeout(timeout);
      process.exit(1);
    }
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
