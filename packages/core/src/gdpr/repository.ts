import type { EventEnvelope } from "../events/envelope";

export type ExportRequestRow = {
  id: string;
  userId: string;
  status: "pending" | "processing" | "ready" | "expired" | "failed";
  storageKey: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
};

export type DeletionRequestRow = {
  id: string;
  userId: string;
  requestedAt: Date;
  scheduledFor: Date;
  status: "pending" | "cancelled" | "completed";
};

export type GdprRepository = {
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  findActiveExportRequest: (userId: string) => Promise<ExportRequestRow | null>;
  insertExportRequest: (userId: string, tx?: unknown) => Promise<ExportRequestRow>;
  latestExportRequest: (userId: string) => Promise<ExportRequestRow | null>;
  claimExportRequest: (requestId: string) => Promise<ExportRequestRow | null>;
  markExportReady: (
    requestId: string,
    fields: { storageKey: string; expiresAt: Date },
  ) => Promise<void>;
  markExportFailed: (requestId: string) => Promise<void>;
  listExpiredExports: () => Promise<ExportRequestRow[]>;
  markExportExpired: (requestId: string) => Promise<void>;
  findPendingDeletion: (userId: string) => Promise<DeletionRequestRow | null>;
  insertDeletionRequest: (userId: string, scheduledFor: Date) => Promise<DeletionRequestRow>;
  cancelDeletionRequest: (userId: string) => Promise<DeletionRequestRow | null>;
  selectDueDeletionsForUpdate: (tx: unknown) => Promise<DeletionRequestRow[]>;
  markDeletionCompleted: (id: string, tx: unknown) => Promise<void>;
  anonymizeUser: (
    userId: string,
    tx: unknown,
  ) => Promise<{ avatarKey: string | null; exportKeys: string[] }>;
  writeEvent: (envelope: EventEnvelope, tx?: unknown) => Promise<void>;
};
