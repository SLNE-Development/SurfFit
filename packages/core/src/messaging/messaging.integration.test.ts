import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import type { Channel, ChannelModel, ConfirmChannel } from "amqplib";
import amqplib from "amqplib";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { userRegisteredEvent } from "../events/user-registered";
import { consumerGroups } from "./groups";
import { publishEvent } from "./publisher";
import { assertTopology } from "./topology";

let container: StartedRabbitMQContainer;
let connection: ChannelModel;

beforeAll(async () => {
  container = await new RabbitMQContainer("rabbitmq:4.1-management-alpine").start();
  connection = await amqplib.connect(container.getAmqpUrl());
}, 120_000);

afterAll(async () => {
  await connection.close();
  await container.stop();
});

const openChannels: Channel[] = [];

afterEach(async () => {
  for (const channel of openChannels.splice(0)) {
    await channel.close().catch(() => {});
  }
});

async function openConfirmChannel(): Promise<ConfirmChannel> {
  const channel = await connection.createConfirmChannel();
  openChannels.push(channel);
  return channel;
}

describe("rabbitmq topology and messaging", () => {
  it("asserting topology twice does not throw", async () => {
    const channel = await openConfirmChannel();

    await assertTopology(channel);
    await assertTopology(channel);
  });

  it("delivers a published event to a bound test group", async () => {
    const channel = await openConfirmChannel();
    await assertTopology(channel);

    const testQueue = "surffit.system";
    await channel.purgeQueue(testQueue);

    const envelope = userRegisteredEvent.create({ userId: "u1", locale: "en" });
    await publishEvent(channel, envelope);

    const received = await new Promise<boolean>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timed out waiting for message")), 5000);
      channel.consume(testQueue, (msg) => {
        if (!msg) return;
        clearTimeout(timeout);
        const parsed = JSON.parse(msg.content.toString());
        channel.ack(msg);
        resolve(parsed.id === envelope.id);
      });
    });

    expect(received).toBe(true);
  });

  it("moves a message to the group's dead queue after 3 retry hops", async () => {
    const channel = await openConfirmChannel();
    const queueName = "surffit.system";
    const deadQueueName = `${queueName}.dead`;

    for (const groupName of Object.keys(consumerGroups)) {
      for (const suffix of ["10s", "1m", "10m"]) {
        await channel.deleteQueue(`surffit.${groupName}.retry.${suffix}`).catch(() => {});
      }
    }

    const retryTtlMs = { "10s": 200, "1m": 200, "10m": 200 };
    await assertTopology(channel, { retryTtlMs });

    await channel.purgeQueue(queueName);
    await channel.purgeQueue(deadQueueName);

    const envelope = userRegisteredEvent.create({ userId: "u2", locale: "en" });
    await publishEvent(channel, envelope);

    const maxRetries = 3;
    const suffixes = Object.keys(retryTtlMs);

    async function waitForMessage(queue: string, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const msg = await channel.get(queue, { noAck: false });
        if (msg) return msg;
        if (Date.now() > deadline) {
          throw new Error(`timed out waiting for a message on ${queue}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    async function processOneHop(): Promise<void> {
      const msg = await waitForMessage(queueName);

      const retryCount = Number(msg.properties.headers?.["x-retry-count"] ?? 0);
      if (retryCount < maxRetries) {
        const suffix = suffixes[retryCount] ?? suffixes[suffixes.length - 1];
        channel.publish("", `${queueName}.retry.${suffix}`, msg.content, {
          persistent: true,
          headers: { "x-retry-count": retryCount + 1 },
        });
      } else {
        channel.publish("", deadQueueName, msg.content, { persistent: true });
      }
      channel.ack(msg);
    }

    for (let i = 0; i <= maxRetries; i++) {
      await processOneHop();
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const deadQueueStatus = await channel.checkQueue(deadQueueName);
    expect(deadQueueStatus.messageCount).toBeGreaterThanOrEqual(1);
  });
});
