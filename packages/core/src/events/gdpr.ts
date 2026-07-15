import { z } from "zod";
import { defineEvent } from "./envelope";

export const gdprExportRequestedPayloadSchema = z.object({
  requestId: z.string(),
  userId: z.string(),
});

export const gdprExportRequestedEvent = defineEvent({
  type: "gdpr.export.requested",
  version: 1,
  payloadSchema: gdprExportRequestedPayloadSchema,
});

export const gdprSweepPayloadSchema = z.object({}).strict();

// Published directly to the exchange by the worker cron loop — a timer
// tick is not domain state, so it never goes through the outbox.
export const gdprSweepEvent = defineEvent({
  type: "gdpr.sweep",
  version: 1,
  payloadSchema: gdprSweepPayloadSchema,
});
