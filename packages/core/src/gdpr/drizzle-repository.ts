import type { Db } from "@surffit/db";
import { schema } from "@surffit/db";
import { and, eq, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { writeOutbox } from "../outbox/write";
import type { DeletionRequestRow, ExportRequestRow, GdprRepository } from "./repository";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const EXPORT_ROW_COLUMNS = {
  id: schema.dataExportRequests.id,
  userId: schema.dataExportRequests.userId,
  status: schema.dataExportRequests.status,
  storageKey: schema.dataExportRequests.storageKey,
  requestedAt: schema.dataExportRequests.requestedAt,
  completedAt: schema.dataExportRequests.completedAt,
  expiresAt: schema.dataExportRequests.expiresAt,
};

const DELETION_ROW_COLUMNS = {
  id: schema.accountDeletionRequests.id,
  userId: schema.accountDeletionRequests.userId,
  requestedAt: schema.accountDeletionRequests.requestedAt,
  scheduledFor: schema.accountDeletionRequests.scheduledFor,
  status: schema.accountDeletionRequests.status,
};

export function createGdprRepository(db: Db): GdprRepository {
  return {
    async withTransaction(fn) {
      return db.transaction((tx) => fn(tx));
    },

    async findActiveExportRequest(userId) {
      const [row] = await db
        .select(EXPORT_ROW_COLUMNS)
        .from(schema.dataExportRequests)
        .where(
          and(
            eq(schema.dataExportRequests.userId, userId),
            or(
              eq(schema.dataExportRequests.status, "pending"),
              eq(schema.dataExportRequests.status, "processing"),
            ),
          ),
        );
      return row ?? null;
    },

    async insertExportRequest(userId, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      const [row] = await executor
        .insert(schema.dataExportRequests)
        .values({ userId })
        .returning(EXPORT_ROW_COLUMNS);
      if (!row) throw new Error(`failed to insert export request for user ${userId}`);
      return row;
    },

    async latestExportRequest(userId) {
      const rows = await db
        .select(EXPORT_ROW_COLUMNS)
        .from(schema.dataExportRequests)
        .where(eq(schema.dataExportRequests.userId, userId))
        .orderBy(sql`${schema.dataExportRequests.requestedAt} desc`)
        .limit(1);
      return rows[0] ?? null;
    },

    async claimExportRequest(requestId) {
      const rows = await db
        .update(schema.dataExportRequests)
        .set({ status: "processing" })
        .where(
          and(
            eq(schema.dataExportRequests.id, requestId),
            eq(schema.dataExportRequests.status, "pending"),
          ),
        )
        .returning(EXPORT_ROW_COLUMNS);
      return rows[0] ?? null;
    },

    async markExportReady(requestId, fields) {
      await db
        .update(schema.dataExportRequests)
        .set({
          status: "ready",
          storageKey: fields.storageKey,
          expiresAt: fields.expiresAt,
          completedAt: new Date(),
        })
        .where(eq(schema.dataExportRequests.id, requestId));
    },

    async markExportFailed(requestId) {
      await db
        .update(schema.dataExportRequests)
        .set({ status: "failed" })
        .where(eq(schema.dataExportRequests.id, requestId));
    },

    async listExpiredExports() {
      return db
        .select(EXPORT_ROW_COLUMNS)
        .from(schema.dataExportRequests)
        .where(
          and(
            eq(schema.dataExportRequests.status, "ready"),
            isNotNull(schema.dataExportRequests.expiresAt),
            lte(schema.dataExportRequests.expiresAt, new Date()),
          ),
        );
    },

    async markExportExpired(requestId) {
      await db
        .update(schema.dataExportRequests)
        .set({ status: "expired" })
        .where(eq(schema.dataExportRequests.id, requestId));
    },

    async findPendingDeletion(userId) {
      const [row] = await db
        .select(DELETION_ROW_COLUMNS)
        .from(schema.accountDeletionRequests)
        .where(
          and(
            eq(schema.accountDeletionRequests.userId, userId),
            eq(schema.accountDeletionRequests.status, "pending"),
          ),
        );
      return row ?? null;
    },

    async insertDeletionRequest(userId, scheduledFor) {
      const [row] = await db
        .insert(schema.accountDeletionRequests)
        .values({ userId, scheduledFor })
        .returning(DELETION_ROW_COLUMNS);
      if (!row) throw new Error(`failed to insert deletion request for user ${userId}`);
      return row;
    },

    async cancelDeletionRequest(userId) {
      const rows = await db
        .update(schema.accountDeletionRequests)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(schema.accountDeletionRequests.userId, userId),
            eq(schema.accountDeletionRequests.status, "pending"),
          ),
        )
        .returning(DELETION_ROW_COLUMNS);
      return rows[0] ?? null;
    },

    async selectDueDeletionsForUpdate(tx) {
      const executor = tx as Tx;
      const result = await executor.execute<{
        id: string;
        user_id: string;
        requested_at: string;
        scheduled_for: string;
        status: DeletionRequestRow["status"];
      }>(sql`
        select id, user_id, requested_at, scheduled_for, status
        from account_deletion_requests
        where status = 'pending' and scheduled_for <= now()
        for update skip locked
      `);
      return result.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        requestedAt: new Date(row.requested_at),
        scheduledFor: new Date(row.scheduled_for),
        status: row.status,
      }));
    },

    async markDeletionCompleted(id, tx) {
      const executor = tx as Tx;
      await executor
        .update(schema.accountDeletionRequests)
        .set({ status: "completed" })
        .where(eq(schema.accountDeletionRequests.id, id));
    },

    async anonymizeUser(userId, tx) {
      const executor = tx as Tx;

      const [userRow] = await executor
        .select({ avatarKey: schema.users.avatarKey })
        .from(schema.users)
        .where(eq(schema.users.id, userId));

      const exportRows = await executor
        .select({
          id: schema.dataExportRequests.id,
          storageKey: schema.dataExportRequests.storageKey,
        })
        .from(schema.dataExportRequests)
        .where(
          and(
            eq(schema.dataExportRequests.userId, userId),
            sql`${schema.dataExportRequests.expiresAt} is null or ${schema.dataExportRequests.expiresAt} > now()`,
          ),
        );

      const exportKeys = exportRows
        .map((r) => r.storageKey)
        .filter((key): key is string => key !== null);

      await executor
        .update(schema.users)
        .set({
          username: null,
          displayName: null,
          name: null,
          image: null,
          email: `deleted-${userId}@anonymized.invalid`,
          avatarKey: null,
          biography: null,
          anonymizedAt: new Date(),
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));

      await executor.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
      await executor.delete(schema.accounts).where(eq(schema.accounts.userId, userId));
      await executor
        .delete(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId));
      await executor
        .delete(schema.privacySettings)
        .where(eq(schema.privacySettings.userId, userId));
      await executor.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));

      if (exportRows.length > 0) {
        await executor
          .update(schema.dataExportRequests)
          .set({ status: "expired" })
          .where(
            inArray(
              schema.dataExportRequests.id,
              exportRows.map((r) => r.id),
            ),
          );
      }

      return { avatarKey: userRow?.avatarKey ?? null, exportKeys };
    },

    async writeEvent(envelope, tx) {
      await writeOutbox(tx as Tx, envelope);
    },
  };
}
