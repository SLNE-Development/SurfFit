import amqplib, { type ChannelModel } from "amqplib";
import { createLogger } from "../logger";

const logger = createLogger("messaging");

export async function connect(
  url: string,
  opts: { retryDelayMs?: number; maxRetries?: number } = {},
): Promise<ChannelModel> {
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  const maxRetries = opts.maxRetries ?? Number.POSITIVE_INFINITY;

  let attempt = 0;

  for (;;) {
    try {
      const connection = await amqplib.connect(url);
      logger.info("connected to rabbitmq");
      return connection;
    } catch (error) {
      attempt += 1;
      if (attempt >= maxRetries) {
        throw error;
      }
      logger.warn({ err: error, attempt }, "rabbitmq connection failed, retrying");
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
