import type { ChannelModel, ConsumeMessage } from "amqplib";
import { eventRegistry } from "../events/registry";
import { createLogger } from "../logger";
import { consumerGroups } from "./groups";

const MAX_RETRIES = 3;
const RETRY_SUFFIXES = ["10s", "1m", "10m"] as const;

export type StartConsumersOptions = {
  maxRetries?: number;
};

export async function startConsumers(
  connection: ChannelModel,
  groupNames: string[],
  opts: StartConsumersOptions = {},
): Promise<{ stop: () => Promise<void> }> {
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  const logger = createLogger("messaging");
  const channel = await connection.createChannel();
  await channel.prefetch(10);

  const consumerTags: string[] = [];

  for (const groupName of groupNames) {
    const group = consumerGroups[groupName];
    if (!group) {
      throw new Error(`Unknown consumer group: ${groupName}`);
    }

    const queueName = `surffit.${groupName}`;
    const deadQueueName = `${queueName}.dead`;

    const { consumerTag } = await channel.consume(queueName, async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);

      let envelope: ReturnType<(typeof eventRegistry)[string]["parse"]> | undefined;
      try {
        const raw = JSON.parse(msg.content.toString());
        const definition = eventRegistry[raw.type as keyof typeof eventRegistry];
        envelope = definition?.parse(raw);
      } catch {
        envelope = undefined;
      }

      if (!envelope) {
        channel.publish("", deadQueueName, msg.content, { persistent: true });
        channel.ack(msg);
        return;
      }

      try {
        await group.handler(envelope, { logger });
        channel.ack(msg);
      } catch (error) {
        logger.warn({ err: error, type: envelope.type, retryCount }, "handler failed");

        if (retryCount < maxRetries) {
          const suffix = RETRY_SUFFIXES[retryCount] ?? RETRY_SUFFIXES[RETRY_SUFFIXES.length - 1];
          const retryQueueName = `${queueName}.retry.${suffix}`;
          channel.publish("", retryQueueName, msg.content, {
            persistent: true,
            headers: { "x-retry-count": retryCount + 1 },
          });
        } else {
          channel.publish("", deadQueueName, msg.content, { persistent: true });
        }
        channel.ack(msg);
      }
    });

    consumerTags.push(consumerTag);
  }

  return {
    async stop() {
      for (const tag of consumerTags) {
        await channel.cancel(tag);
      }
      await channel.close();
    },
  };
}
