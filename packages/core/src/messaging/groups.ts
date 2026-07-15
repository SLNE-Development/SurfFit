import type { Db } from "@surffit/db";
import type { EventEnvelope } from "../events/envelope";
import { createGdprRepository } from "../gdpr/drizzle-repository";
import { createGdprService } from "../gdpr/service";
import { createIdentityExportSections } from "../identity/export";
import { createIdentityRepository } from "../identity/repository";
import type { createLogger } from "../logger";
import type { StorageProvider } from "../storage/port";

export type ConsumerServices = {
  db: Db;
  storage: StorageProvider;
};

export type ConsumerGroupHandler = (
  envelope: EventEnvelope,
  ctx: { logger: ReturnType<typeof createLogger> } & Partial<ConsumerServices>,
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
  gdpr: {
    bindings: ["gdpr.#"],
    async handler(envelope, ctx) {
      if (!ctx.db || !ctx.storage) {
        throw new Error("gdpr consumer group requires db and storage in ConsumerServices");
      }

      const service = createGdprService({
        repo: createGdprRepository(ctx.db),
        storage: ctx.storage,
        sections: createIdentityExportSections(createIdentityRepository(ctx.db)),
      });

      if (envelope.type === "gdpr.export.requested") {
        const payload = envelope.payload as { requestId: string };
        await service.runExport(payload.requestId);
      } else if (envelope.type === "gdpr.sweep") {
        const counts = await service.sweep();
        ctx.logger.info(counts, "gdpr sweep completed");
      }
    },
  },
};
