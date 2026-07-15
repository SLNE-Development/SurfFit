import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, PermissionDeniedError } from "../errors";
import { type ModerationRepository, createModerationService } from "./service";

const MODERATOR_ID = "mod1";
const PLAIN_USER_ID = "user1";

function makeRepo(overrides: Partial<ModerationRepository> = {}): ModerationRepository {
  return {
    async getUserRoles(userId) {
      if (userId === MODERATOR_ID) return ["moderator"];
      return [];
    },
    async withTransaction(fn) {
      return fn(undefined);
    },
    async listPendingContent() {
      return [];
    },
    async claimPendingContent() {
      return true;
    },
    async insertModerationAction() {},
    async writeEvent() {},
    async subjectExists() {
      return true;
    },
    async hasOpenReport() {
      return false;
    },
    async insertReport(row) {
      return {
        id: "report1",
        subjectType: row.subjectType,
        subjectId: row.subjectId,
        reason: row.reason,
        details: row.details,
        status: "open",
      };
    },
    async listReports() {
      return [];
    },
    async resolveReport() {
      return true;
    },
    ...overrides,
  };
}

describe("moderation service — permission gating", () => {
  it("rejects a non-moderator on every gated method", async () => {
    const service = createModerationService(makeRepo());

    await expect(service.getQueue(PLAIN_USER_ID)).rejects.toThrow(PermissionDeniedError);
    await expect(
      service.review(PLAIN_USER_ID, {
        subjectType: "movement",
        subjectId: "m1",
        decision: "approve",
      }),
    ).rejects.toThrow(PermissionDeniedError);
    await expect(service.listReports(PLAIN_USER_ID, {})).rejects.toThrow(PermissionDeniedError);
    await expect(
      service.resolveReport(PLAIN_USER_ID, { reportId: "r1", resolution: "resolved" }),
    ).rejects.toThrow(PermissionDeniedError);
  });
});

describe("moderation service — review", () => {
  it("claims, writes one action row and one content.moderated envelope in a tx", async () => {
    let actionCount = 0;
    let envelopeCount = 0;
    const repo = makeRepo({
      insertModerationAction: async () => {
        actionCount++;
      },
      writeEvent: async () => {
        envelopeCount++;
      },
    });
    const service = createModerationService(repo);

    const result = await service.review(MODERATOR_ID, {
      subjectType: "movement",
      subjectId: "m1",
      decision: "approve",
    });

    expect(result).toEqual({ subjectType: "movement", subjectId: "m1", status: "approved" });
    expect(actionCount).toBe(1);
    expect(envelopeCount).toBe(1);
  });

  it("throws moderation.alreadyReviewed on a second review of the same subject", async () => {
    const repo = makeRepo({ claimPendingContent: async () => false });
    const service = createModerationService(repo);

    await expect(
      service.review(MODERATOR_ID, {
        subjectType: "movement",
        subjectId: "m1",
        decision: "approve",
      }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("moderation service — createReport", () => {
  it("throws moderation.subject.notFound for a missing subject", async () => {
    const repo = makeRepo({ subjectExists: async () => false });
    const service = createModerationService(repo);

    await expect(
      service.createReport(PLAIN_USER_ID, {
        subjectType: "movement",
        subjectId: "m1",
        reason: "spam",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws moderation.report.duplicate for a second open report by the same reporter", async () => {
    const repo = makeRepo({ hasOpenReport: async () => true });
    const service = createModerationService(repo);

    await expect(
      service.createReport(PLAIN_USER_ID, {
        subjectType: "movement",
        subjectId: "m1",
        reason: "spam",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("allows a different reporter on the same subject", async () => {
    const seenReporters = new Set<string>();
    const repo = makeRepo({
      hasOpenReport: async (reporterId) => {
        const alreadySeen = seenReporters.has(reporterId);
        seenReporters.add(reporterId);
        return alreadySeen;
      },
    });
    const service = createModerationService(repo);

    await service.createReport("reporterA", {
      subjectType: "movement",
      subjectId: "m1",
      reason: "spam",
    });
    await expect(
      service.createReport("reporterB", {
        subjectType: "movement",
        subjectId: "m1",
        reason: "spam",
      }),
    ).resolves.toBeDefined();
  });
});

describe("moderation service — resolveReport", () => {
  it("flips open to resolved, and a repeat throws moderation.report.alreadyClosed", async () => {
    let closed = false;
    const repo = makeRepo({
      resolveReport: async () => {
        if (closed) return false;
        closed = true;
        return true;
      },
    });
    const service = createModerationService(repo);

    await service.resolveReport(MODERATOR_ID, { reportId: "r1", resolution: "resolved" });
    await expect(
      service.resolveReport(MODERATOR_ID, { reportId: "r1", resolution: "resolved" }),
    ).rejects.toThrow(ConflictError);
  });
});
