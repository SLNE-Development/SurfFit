import { newId } from "@surffit/db";
import { z } from "zod";

export const envelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  version: z.number().int().positive(),
  occurredAt: z.string(),
  payload: z.unknown(),
});

export type EventEnvelope<TPayload = unknown> = {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  payload: TPayload;
};

export function defineEvent<TPayload>(opts: {
  type: string;
  version: number;
  payloadSchema: z.ZodType<TPayload>;
}) {
  const fullSchema = z.object({
    id: z.string(),
    type: z.literal(opts.type),
    version: z.literal(opts.version),
    occurredAt: z.string(),
    payload: opts.payloadSchema,
  });

  return {
    type: opts.type,
    version: opts.version,
    create(payload: TPayload): EventEnvelope<TPayload> {
      return {
        id: newId(),
        type: opts.type,
        version: opts.version,
        occurredAt: new Date().toISOString(),
        payload,
      };
    },
    parse(input: unknown): EventEnvelope<TPayload> {
      return fullSchema.parse(input);
    },
  };
}
