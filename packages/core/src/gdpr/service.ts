import { ConflictError, NotFoundError } from "../errors";
import { gdprExportRequestedEvent } from "../events/gdpr";
import { userDeletedEvent } from "../events/user-deleted";
import type { ExportSection } from "../identity/export";
import { createLogger } from "../logger";
import type { StorageProvider } from "../storage/port";
import type { DeletionRequestRow, ExportRequestRow, GdprRepository } from "./repository";

export const DELETION_GRACE_DAYS = 30;
export const EXPORT_TTL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CreateGdprServiceOptions = {
  repo: GdprRepository;
  storage: StorageProvider;
  sections: ExportSection[];
  graceDays?: number;
  exportTtlDays?: number;
};

export function createGdprService(opts: CreateGdprServiceOptions) {
  const { repo, storage, sections } = opts;
  const graceDays = opts.graceDays ?? DELETION_GRACE_DAYS;
  const exportTtlDays = opts.exportTtlDays ?? EXPORT_TTL_DAYS;
  const logger = createLogger("gdpr");

  function withDownloadUrl(
    row: ExportRequestRow,
  ): Promise<ExportRequestRow & { downloadUrl: string | null }> {
    const isReady =
      row.status === "ready" && row.storageKey && row.expiresAt && row.expiresAt > new Date();
    if (!isReady) {
      return Promise.resolve({ ...row, downloadUrl: null });
    }
    return storage
      .getSignedDownloadUrl(row.storageKey as string, {
        expiresInSeconds: 900,
        downloadFilename: "surffit-export.json",
      })
      .then((downloadUrl) => ({ ...row, downloadUrl }));
  }

  return {
    async requestExport(userId: string): Promise<ExportRequestRow> {
      const active = await repo.findActiveExportRequest(userId);
      if (active) {
        throw new ConflictError("gdpr.export.alreadyPending");
      }

      return repo.withTransaction(async (tx) => {
        const row = await repo.insertExportRequest(userId, tx);
        await repo.writeEvent(gdprExportRequestedEvent.create({ requestId: row.id, userId }), tx);
        return row;
      });
    },

    async getExportStatus(userId: string) {
      const row = await repo.latestExportRequest(userId);
      if (!row) return null;
      return withDownloadUrl(row);
    },

    async runExport(requestId: string): Promise<void> {
      const claimed = await repo.claimExportRequest(requestId);
      if (!claimed) return;

      try {
        const collected: Record<string, unknown> = {};
        for (const section of sections) {
          collected[section.name] = await section.collect(claimed.userId);
        }

        const payload = {
          exportedAt: new Date().toISOString(),
          userId: claimed.userId,
          sections: collected,
        };

        const key = `exports/${claimed.userId}/${requestId}.json`;
        await storage.putObject(key, new TextEncoder().encode(JSON.stringify(payload)), {
          contentType: "application/json",
        });

        await repo.markExportReady(requestId, {
          storageKey: key,
          expiresAt: new Date(Date.now() + exportTtlDays * DAY_MS),
        });
      } catch (err) {
        logger.error({ err, requestId }, "gdpr export failed");
        await repo.markExportFailed(requestId);
      }
    },

    async requestDeletion(userId: string): Promise<DeletionRequestRow> {
      const pending = await repo.findPendingDeletion(userId);
      if (pending) {
        throw new ConflictError("gdpr.deletion.alreadyPending");
      }

      const scheduledFor = new Date(Date.now() + graceDays * DAY_MS);
      return repo.insertDeletionRequest(userId, scheduledFor);
    },

    async cancelDeletion(userId: string): Promise<DeletionRequestRow> {
      const row = await repo.cancelDeletionRequest(userId);
      if (!row) {
        throw new NotFoundError("gdpr.deletion.notFound");
      }
      return row;
    },

    async getDeletionStatus(userId: string): Promise<DeletionRequestRow | null> {
      return repo.findPendingDeletion(userId);
    },

    async sweep(): Promise<{ deletionsExecuted: number; exportsExpired: number }> {
      const storageKeysToDelete: string[] = [];

      const deletionsExecuted = await repo.withTransaction(async (tx) => {
        const due = await repo.selectDueDeletionsForUpdate(tx);
        for (const deletion of due) {
          const { avatarKey, exportKeys } = await repo.anonymizeUser(deletion.userId, tx);
          if (avatarKey) storageKeysToDelete.push(avatarKey);
          storageKeysToDelete.push(...exportKeys);
          await repo.writeEvent(userDeletedEvent.create({ userId: deletion.userId }), tx);
          await repo.markDeletionCompleted(deletion.id, tx);
        }
        return due.length;
      });

      for (const key of storageKeysToDelete) {
        try {
          await storage.deleteObject(key);
        } catch (err) {
          logger.warn({ err, key }, "failed to delete storage object during gdpr sweep");
        }
      }

      const expiredExports = await repo.listExpiredExports();
      let exportsExpired = 0;
      for (const exp of expiredExports) {
        if (exp.storageKey) {
          try {
            await storage.deleteObject(exp.storageKey);
          } catch (err) {
            logger.warn({ err, key: exp.storageKey }, "failed to delete expired export object");
          }
        }
        await repo.markExportExpired(exp.id);
        exportsExpired++;
      }

      return { deletionsExecuted, exportsExpired };
    },
  };
}

export type GdprService = ReturnType<typeof createGdprService>;
