import { reportCreateSchema } from "@surffit/validation";
import type { Role } from "../authz/engine";
import { assertCan } from "../authz/engine";
import { ConflictError, DomainRuleViolationError, NotFoundError } from "../errors";
import { contentModeratedEvent } from "../events/content";
import type { EventEnvelope } from "../events/envelope";
import { reportCreatedEvent } from "../events/report";
import { moderateContentPolicy } from "./policies";

export const REVIEWABLE_SUBJECT_TYPES = ["movement", "exercise", "gym"] as const;
export const REPORTABLE_SUBJECT_TYPES = [...REVIEWABLE_SUBJECT_TYPES, "user"] as const;

export type ReviewableSubjectType = (typeof REVIEWABLE_SUBJECT_TYPES)[number];
export type ReportableSubjectType = (typeof REPORTABLE_SUBJECT_TYPES)[number];
export type ReportReason = "spam" | "inappropriate" | "incorrect" | "copyright" | "other";
export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

export type PendingContentRow = {
  subjectType: ReviewableSubjectType;
  subjectId: string;
  name: string;
  movementSlug: string | null;
  ownerUsername: string | null;
  submittedAt: Date;
};

export type ReportListRow = {
  id: string;
  subjectType: ReportableSubjectType;
  subjectId: string;
  subjectLabel: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reporterUsername: string | null;
  createdAt: Date;
};

export type ReportRow = {
  id: string;
  subjectType: ReportableSubjectType;
  subjectId: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
};

export type ModerationRepository = {
  getUserRoles: (userId: string) => Promise<Role[]>;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  listPendingContent: () => Promise<PendingContentRow[]>;
  claimPendingContent: (
    subjectType: ReviewableSubjectType,
    subjectId: string,
    nextStatus: "approved" | "rejected",
    tx: unknown,
  ) => Promise<boolean>;
  insertModerationAction: (
    row: {
      moderatorUserId: string;
      action: "approve" | "reject";
      subjectType: ReviewableSubjectType;
      subjectId: string;
      reason: string | null;
    },
    tx: unknown,
  ) => Promise<void>;
  writeEvent: (envelope: EventEnvelope, tx: unknown) => Promise<void>;
  subjectExists: (subjectType: ReportableSubjectType, subjectId: string) => Promise<boolean>;
  hasOpenReport: (
    reporterId: string,
    subjectType: ReportableSubjectType,
    subjectId: string,
  ) => Promise<boolean>;
  insertReport: (
    row: {
      reporterUserId: string;
      subjectType: ReportableSubjectType;
      subjectId: string;
      reason: ReportReason;
      details: string | null;
    },
    tx: unknown,
  ) => Promise<ReportRow>;
  listReports: (status: ReportStatus) => Promise<ReportListRow[]>;
  resolveReport: (
    reportId: string,
    resolution: "resolved" | "dismissed",
    resolvedBy: string,
  ) => Promise<boolean>;
};

export function createModerationService(repo: ModerationRepository) {
  async function buildActor(userId: string) {
    return { id: userId, roles: await repo.getUserRoles(userId) };
  }

  return {
    async getQueue(actorUserId: string) {
      const actor = await buildActor(actorUserId);
      assertCan(moderateContentPolicy, actor, null, undefined);
      return repo.listPendingContent();
    },

    async review(
      actorUserId: string,
      input: {
        subjectType: ReviewableSubjectType;
        subjectId: string;
        decision: "approve" | "reject";
        reason?: string;
      },
    ) {
      const actor = await buildActor(actorUserId);
      assertCan(moderateContentPolicy, actor, null, undefined);

      const nextStatus = input.decision === "approve" ? "approved" : "rejected";

      return repo.withTransaction(async (tx) => {
        const claimed = await repo.claimPendingContent(
          input.subjectType,
          input.subjectId,
          nextStatus,
          tx,
        );
        if (!claimed) {
          throw new ConflictError("moderation.alreadyReviewed");
        }

        await repo.insertModerationAction(
          {
            moderatorUserId: actorUserId,
            action: input.decision,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            reason: input.reason ?? null,
          },
          tx,
        );

        const envelope = contentModeratedEvent.create({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          decision: nextStatus,
          moderatorUserId: actorUserId,
        });
        await repo.writeEvent(envelope, tx);

        return { subjectType: input.subjectType, subjectId: input.subjectId, status: nextStatus };
      });
    },

    async createReport(userId: string, input: unknown) {
      const result = reportCreateSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.report.details",
        );
      }

      const exists = await repo.subjectExists(result.data.subjectType, result.data.subjectId);
      if (!exists) {
        throw new NotFoundError("moderation.subject.notFound");
      }

      const duplicate = await repo.hasOpenReport(
        userId,
        result.data.subjectType,
        result.data.subjectId,
      );
      if (duplicate) {
        throw new ConflictError("moderation.report.duplicate");
      }

      return repo.withTransaction(async (tx) => {
        const report = await repo.insertReport(
          {
            reporterUserId: userId,
            subjectType: result.data.subjectType,
            subjectId: result.data.subjectId,
            reason: result.data.reason,
            details: result.data.details ?? null,
          },
          tx,
        );

        const envelope = reportCreatedEvent.create({
          reportId: report.id,
          subjectType: result.data.subjectType,
          subjectId: result.data.subjectId,
          reporterUserId: userId,
        });
        await repo.writeEvent(envelope, tx);

        return report;
      });
    },

    async listReports(actorUserId: string, params: { status?: ReportStatus }) {
      const actor = await buildActor(actorUserId);
      assertCan(moderateContentPolicy, actor, null, undefined);
      return repo.listReports(params.status ?? "open");
    },

    async resolveReport(
      actorUserId: string,
      input: { reportId: string; resolution: "resolved" | "dismissed" },
    ) {
      const actor = await buildActor(actorUserId);
      assertCan(moderateContentPolicy, actor, null, undefined);

      const resolved = await repo.resolveReport(input.reportId, input.resolution, actorUserId);
      if (!resolved) {
        throw new ConflictError("moderation.report.alreadyClosed");
      }
    },
  };
}

export type ModerationService = ReturnType<typeof createModerationService>;
