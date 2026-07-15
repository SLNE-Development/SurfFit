// Moderation is deliberately cross-cutting: this repository is the one place
// permitted to flip the status column on movements/exercises/gyms after
// insert (spec §4.11's polymorphic-table design). Content modules only ever
// insert `pending` rows and never call back into this module.
import { schema } from "@surffit/db";
import type { Db } from "@surffit/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { FALLBACK_LOCALE } from "../locale";
import { writeOutbox } from "../outbox/write";
import type {
  ModerationRepository,
  ReportListRow,
  ReportRow,
  ReportableSubjectType,
  ReviewableSubjectType,
} from "./service";

const {
  movements,
  movementTranslations,
  exercises,
  exerciseTranslations,
  gyms,
  reports,
  moderationActions,
  users,
} = schema;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createModerationRepository(db: Db): ModerationRepository {
  return {
    async getUserRoles(userId) {
      const rows = await db
        .select({ role: schema.userRoles.role })
        .from(schema.userRoles)
        .where(eq(schema.userRoles.userId, userId));
      return rows.map((r) => r.role);
    },

    async withTransaction(fn) {
      return db.transaction((tx) => fn(tx));
    },

    async listPendingContent() {
      const enT = alias(movementTranslations, "en_t");
      const movementRows = await db
        .select({
          subjectId: movements.id,
          name: enT.name,
          movementSlug: movements.slug,
          ownerUsername: users.username,
          submittedAt: movements.createdAt,
        })
        .from(movements)
        .innerJoin(enT, and(eq(enT.movementId, movements.id), eq(enT.locale, FALLBACK_LOCALE)))
        .leftJoin(users, eq(users.id, movements.ownerUserId))
        .where(and(eq(movements.status, "pending"), isNull(movements.deletedAt)));

      const exEnT = alias(exerciseTranslations, "en_t");
      const exerciseRows = await db
        .select({
          subjectId: exercises.id,
          name: exEnT.name,
          movementSlug: movements.slug,
          ownerUsername: users.username,
          submittedAt: exercises.createdAt,
        })
        .from(exercises)
        .innerJoin(movements, eq(movements.id, exercises.movementId))
        .innerJoin(
          exEnT,
          and(eq(exEnT.exerciseId, exercises.id), eq(exEnT.locale, FALLBACK_LOCALE)),
        )
        .leftJoin(users, eq(users.id, exercises.ownerUserId))
        .where(and(eq(exercises.status, "pending"), isNull(exercises.deletedAt)));

      const gymRows = await db
        .select({
          subjectId: gyms.id,
          name: gyms.name,
          ownerUsername: users.username,
          submittedAt: gyms.createdAt,
        })
        .from(gyms)
        .leftJoin(users, eq(users.id, gyms.ownerUserId))
        .where(and(eq(gyms.status, "pending"), isNull(gyms.deletedAt)));

      const merged = [
        ...movementRows.map((row) => ({ ...row, subjectType: "movement" as const })),
        ...exerciseRows.map((row) => ({ ...row, subjectType: "exercise" as const })),
        ...gymRows.map((row) => ({
          ...row,
          movementSlug: null,
          subjectType: "gym" as const,
        })),
      ];

      return merged.sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
    },

    async claimPendingContent(subjectType, subjectId, nextStatus, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      const table = tableForSubjectType(subjectType);

      const rows = await executor
        .update(table)
        .set({ status: nextStatus })
        .where(and(eq(table.id, subjectId), eq(table.status, "pending"), isNull(table.deletedAt)))
        .returning({ id: table.id });
      return rows.length > 0;
    },

    async insertModerationAction(row, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      await executor.insert(moderationActions).values({
        moderatorUserId: row.moderatorUserId,
        action: row.action,
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        reason: row.reason,
      });
    },

    async writeEvent(envelope, tx) {
      await writeOutbox(tx as Tx, envelope);
    },

    async subjectExists(subjectType, subjectId) {
      if (subjectType === "user") {
        const rows = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, subjectId), isNull(users.deletedAt), isNull(users.anonymizedAt)));
        return rows.length > 0;
      }

      const table = tableForSubjectType(subjectType);
      const rows = await db
        .select({ id: table.id })
        .from(table)
        .where(and(eq(table.id, subjectId), isNull(table.deletedAt)));
      return rows.length > 0;
    },

    async hasOpenReport(reporterId, subjectType, subjectId) {
      const rows = await db
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.reporterUserId, reporterId),
            eq(reports.subjectType, subjectType),
            eq(reports.subjectId, subjectId),
            inArray(reports.status, ["open", "reviewing"]),
          ),
        );
      return rows.length > 0;
    },

    async insertReport(row, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      const [inserted] = await executor
        .insert(reports)
        .values({
          reporterUserId: row.reporterUserId,
          subjectType: row.subjectType,
          subjectId: row.subjectId,
          reason: row.reason,
          details: row.details,
        })
        .returning({
          id: reports.id,
          subjectType: reports.subjectType,
          subjectId: reports.subjectId,
          reason: reports.reason,
          details: reports.details,
          status: reports.status,
        });
      if (!inserted) throw new Error("failed to insert report");
      return inserted as ReportRow;
    },

    async listReports(status) {
      const reporterUsers = alias(users, "reporter");
      const rows = await db
        .select({
          id: reports.id,
          subjectType: reports.subjectType,
          subjectId: reports.subjectId,
          reason: reports.reason,
          details: reports.details,
          status: reports.status,
          reporterUsername: reporterUsers.username,
          createdAt: reports.createdAt,
        })
        .from(reports)
        .leftJoin(reporterUsers, eq(reporterUsers.id, reports.reporterUserId))
        .where(eq(reports.status, status))
        .orderBy(desc(reports.createdAt));

      const results: ReportListRow[] = [];
      for (const row of rows) {
        const label = await resolveSubjectLabel(db, row.subjectType, row.subjectId);
        results.push({
          ...row,
          subjectType: row.subjectType as ReportableSubjectType,
          subjectLabel: label,
        });
      }
      return results;
    },

    async resolveReport(reportId, resolution, resolvedBy) {
      const rows = await db
        .update(reports)
        .set({ status: resolution, resolvedBy, resolvedAt: new Date() })
        .where(and(eq(reports.id, reportId), inArray(reports.status, ["open", "reviewing"])))
        .returning({ id: reports.id });
      return rows.length > 0;
    },
  };
}

function tableForSubjectType(subjectType: ReviewableSubjectType) {
  if (subjectType === "movement") return movements;
  if (subjectType === "exercise") return exercises;
  return gyms;
}

async function resolveSubjectLabel(
  db: Db,
  subjectType: string,
  subjectId: string,
): Promise<string> {
  if (subjectType === "movement") {
    const [row] = await db
      .select({ name: movementTranslations.name })
      .from(movementTranslations)
      .where(
        and(
          eq(movementTranslations.movementId, subjectId),
          eq(movementTranslations.locale, FALLBACK_LOCALE),
        ),
      );
    return row?.name ?? "deleted";
  }
  if (subjectType === "exercise") {
    const [row] = await db
      .select({ name: exerciseTranslations.name })
      .from(exerciseTranslations)
      .where(
        and(
          eq(exerciseTranslations.exerciseId, subjectId),
          eq(exerciseTranslations.locale, FALLBACK_LOCALE),
        ),
      );
    return row?.name ?? "deleted";
  }
  if (subjectType === "gym") {
    const [row] = await db.select({ name: gyms.name }).from(gyms).where(eq(gyms.id, subjectId));
    return row?.name ?? "deleted";
  }
  const [row] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, subjectId));
  return row?.username ?? "deleted";
}
