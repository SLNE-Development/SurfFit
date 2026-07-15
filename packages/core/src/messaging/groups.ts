import type { EventEnvelope } from "../events/envelope";
import type { createLogger } from "../logger";

export type ConsumerGroupHandler = (
  envelope: EventEnvelope,
  ctx: { logger: ReturnType<typeof createLogger> },
) => Promise<void>;

export type ConsumerGroup = {
  bindings: string[];
  handler: ConsumerGroupHandler;
};

export const consumerGroups: Record<string, ConsumerGroup> = {
  system: {
    bindings: ["user.*"],
    async handler(envelope, ctx) {
      ctx.logger.info({ type: envelope.type, id: envelope.id }, "event received");
    },
  },
};
