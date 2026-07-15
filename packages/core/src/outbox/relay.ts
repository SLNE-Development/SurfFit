import type { Db } from "@surffit/db";
import { schema } from "@surffit/db";
import type { ConfirmChannel } from "amqplib";
import { sql } from "drizzle-orm";
import { createLogger } from "../logger";
import { publishEvent } from "../messaging/publisher";

export type StartOutboxRelayOptions = {
  db: Db;
  channel: ConfirmChannel;
  intervalMs?: number;
  batchSize?: number;
};

export function startOutboxRelay(opts: StartOutboxRelayOptions): { stop: () => Promise<void> } {
  const logger = createLogger("outbox-relay");
  const intervalMs = opts.intervalMs ?? 1000;
  const batchSize = opts.batchSize ?? 50;

  let stopped = false;
  let inFlight: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function tick(): Promise<void> {
    await opts.db.transaction(async (tx) => {
      const rows = await tx.execute<{
        id: string;
        event_type: string;
        schema_version: number;
        payload: unknown;
        occurred_at: string;
      }>(sql`
        select id, event_type, schema_version, payload, occurred_at
        from outbox_events
        where dispatched_at is null
        order by occurred_at
        limit ${batchSize}
        for update skip locked
      `);

      for (const row of rows.rows) {
        try {
          await publishEvent(opts.channel, {
            id: row.id,
            type: row.event_type,
            version: row.schema_version,
            occurredAt: new Date(row.occurred_at).toISOString(),
            payload: row.payload,
          });

          await tx
            .update(schema.outboxEvents)
            .set({ dispatchedAt: new Date(), attempts: sql`${schema.outboxEvents.attempts} + 1` })
            .where(sql`${schema.outboxEvents.id} = ${row.id}`);
        } catch (error) {
          logger.warn({ err: error, eventId: row.id }, "failed to publish outbox event");
          await tx
            .update(schema.outboxEvents)
            .set({ attempts: sql`${schema.outboxEvents.attempts} + 1` })
            .where(sql`${schema.outboxEvents.id} = ${row.id}`);
        }
      }
    });
  }

  function scheduleNext() {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = tick()
        .catch((error) => {
          logger.error({ err: error }, "outbox relay tick failed");
        })
        .finally(scheduleNext);
    }, intervalMs);
  }

  scheduleNext();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    },
  };
}
