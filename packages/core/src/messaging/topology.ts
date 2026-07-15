import type { Channel } from "amqplib";
import { consumerGroups } from "./groups";

export const EVENTS_EXCHANGE = "surffit.events";
export const REALTIME_EXCHANGE = "surffit.realtime";

export type TopologyOptions = {
  retryTtlMs?: { "10s": number; "1m": number; "10m": number };
};

const DEFAULT_RETRY_TTL_MS = { "10s": 10_000, "1m": 60_000, "10m": 600_000 };

export async function assertTopology(channel: Channel, opts: TopologyOptions = {}): Promise<void> {
  const retryTtlMs = opts.retryTtlMs ?? DEFAULT_RETRY_TTL_MS;

  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
  await channel.assertExchange(REALTIME_EXCHANGE, "fanout", { durable: true });

  for (const [groupName, group] of Object.entries(consumerGroups)) {
    const queueName = `surffit.${groupName}`;
    const deadQueueName = `${queueName}.dead`;

    await channel.assertQueue(queueName, { durable: true });
    for (const pattern of group.bindings) {
      await channel.bindQueue(queueName, EVENTS_EXCHANGE, pattern);
    }

    await channel.assertQueue(deadQueueName, { durable: true });

    for (const [suffix, ttl] of Object.entries(retryTtlMs) as [keyof typeof retryTtlMs, number][]) {
      const retryQueueName = `${queueName}.retry.${suffix}`;
      await channel.assertQueue(retryQueueName, {
        durable: true,
        messageTtl: ttl,
        deadLetterExchange: "",
        deadLetterRoutingKey: queueName,
      });
    }
  }
}
