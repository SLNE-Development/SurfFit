import { schema } from "@surffit/db";
import type { EventEnvelope } from "../events/envelope";

type TxLike = {
  insert: (table: typeof schema.outboxEvents) => {
    values: (values: {
      id: string;
      eventType: string;
      schemaVersion: number;
      payload: unknown;
      occurredAt: Date;
    }) => Promise<unknown>;
  };
};

export async function writeOutbox(tx: TxLike, envelope: EventEnvelope): Promise<void> {
  await tx.insert(schema.outboxEvents).values({
    id: envelope.id,
    eventType: envelope.type,
    schemaVersion: envelope.version,
    payload: envelope.payload,
    occurredAt: new Date(envelope.occurredAt),
  });
}
