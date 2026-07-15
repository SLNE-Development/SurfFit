import { createDb, newId, runMigrations, schema } from "@surffit/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import amqplib, { type ChannelModel, type ConfirmChannel } from "amqplib";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertTopology } from "../messaging/topology";
import { startOutboxRelay } from "./relay";
import { writeOutbox } from "./write";

let pgContainer: StartedPostgreSqlContainer;
let rabbitContainer: StartedRabbitMQContainer;
let db: ReturnType<typeof createDb>;
let connection: ChannelModel;
let channel: ConfirmChannel;

beforeAll(async () => {
  [pgContainer, rabbitContainer] = await Promise.all([
    new PostgreSqlContainer("postgres:18-alpine").start(),
    new RabbitMQContainer("rabbitmq:4.1-management-alpine").start(),
  ]);

  await runMigrations(pgContainer.getConnectionUri());
  db = createDb(pgContainer.getConnectionUri());

  connection = await amqplib.connect(rabbitContainer.getAmqpUrl());
  channel = await connection.createConfirmChannel();
  await assertTopology(channel);
}, 120_000);

afterAll(async () => {
  await channel.close();
  await connection.close();
  await db.$client.end();
  await Promise.all([pgContainer.stop(), rabbitContainer.stop()]);
});

async function makeEnvelope(userId: string) {
  return {
    id: newId(),
    type: "user.registered",
    version: 1,
    occurredAt: new Date().toISOString(),
    payload: { userId, locale: "en" },
  };
}

describe("transactional outbox", () => {
  it("leaves zero rows when the writing transaction rolls back", async () => {
    const envelope = await makeEnvelope("rollback-user");

    await expect(
      db.transaction(async (tx) => {
        await writeOutbox(tx, envelope);
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const rows = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, envelope.id));

    expect(rows).toHaveLength(0);
  });

  it("publishes and marks three written events dispatched within a few relay ticks", async () => {
    const envelopes = await Promise.all([makeEnvelope("a"), makeEnvelope("b"), makeEnvelope("c")]);
    const firstEnvelopeId = envelopes[0]?.id;
    if (!firstEnvelopeId) throw new Error("expected at least one envelope");

    await db.transaction(async (tx) => {
      for (const envelope of envelopes) {
        await writeOutbox(tx, envelope);
      }
    });

    const relay = startOutboxRelay({ db, channel, intervalMs: 200, batchSize: 50 });

    try {
      await vi_waitUntil(async () => {
        const rows = await db
          .select()
          .from(schema.outboxEvents)
          .where(eq(schema.outboxEvents.id, firstEnvelopeId));
        return rows.every((r) => r.dispatchedAt !== null);
      });

      for (const envelope of envelopes) {
        const [row] = await db
          .select()
          .from(schema.outboxEvents)
          .where(eq(schema.outboxEvents.id, envelope.id));
        expect(row?.dispatchedAt).not.toBeNull();
      }
    } finally {
      await relay.stop();
    }
  });

  it("dispatches exactly once under concurrent relay instances", async () => {
    const testQueue = `surffit.test.${newId()}`;
    await channel.assertQueue(testQueue, { durable: false, autoDelete: true });
    await channel.bindQueue(testQueue, "surffit.events", "user.*");
    await channel.purgeQueue(testQueue);

    const envelopes = await Promise.all(
      Array.from({ length: 100 }, (_, i) => makeEnvelope(`contention-${i}`)),
    );

    await db.transaction(async (tx) => {
      for (const envelope of envelopes) {
        await writeOutbox(tx, envelope);
      }
    });

    const relayA = startOutboxRelay({ db, channel, intervalMs: 100, batchSize: 20 });
    const relayB = startOutboxRelay({ db, channel, intervalMs: 100, batchSize: 20 });

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await Promise.all([relayA.stop(), relayB.stop()]);

    const status = await channel.checkQueue(testQueue);
    expect(status.messageCount).toBe(100);

    const ids = envelopes.map((e) => e.id);
    const rows = await db.select().from(schema.outboxEvents);
    const dispatchedForTest = rows.filter((r) => ids.includes(r.id));
    expect(dispatchedForTest.every((r) => r.dispatchedAt !== null)).toBe(true);
    expect(dispatchedForTest).toHaveLength(100);
  }, 20_000);

  it("gives up on a poison event after maxAttempts instead of retrying forever", async () => {
    const envelope = await makeEnvelope("poison-user");

    await db.transaction(async (tx) => {
      await writeOutbox(tx, envelope);
    });

    // A closed channel makes every publish attempt fail deterministically.
    const deadConnection = await amqplib.connect(rabbitContainer.getAmqpUrl());
    const deadChannel = await deadConnection.createConfirmChannel();
    await deadChannel.close();
    await deadConnection.close();

    const relay = startOutboxRelay({
      db,
      channel: deadChannel,
      intervalMs: 50,
      batchSize: 10,
      maxAttempts: 3,
    });

    try {
      await vi_waitUntil(async () => {
        const [row] = await db
          .select()
          .from(schema.outboxEvents)
          .where(eq(schema.outboxEvents.id, envelope.id));
        return row !== undefined && row.attempts >= 3;
      }, 10_000);
    } finally {
      await relay.stop();
    }

    const [row] = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.id, envelope.id));

    expect(row?.attempts).toBeGreaterThanOrEqual(3);
    expect(row?.dispatchedAt).not.toBeNull();
  }, 15_000);
});

async function vi_waitUntil(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
