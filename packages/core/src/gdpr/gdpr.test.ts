import { describe, expect, it } from "vitest";
import type { ExportSection } from "../identity/export";
import type { StorageProvider } from "../storage/port";
import type { DeletionRequestRow, ExportRequestRow, GdprRepository } from "./repository";
import { createGdprService } from "./service";

function makeExportRow(overrides: Partial<ExportRequestRow> & { id: string }): ExportRequestRow {
  return {
    userId: "user-1",
    status: "pending",
    storageKey: null,
    requestedAt: new Date(),
    completedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

function makeDeletionRow(
  overrides: Partial<DeletionRequestRow> & { id: string },
): DeletionRequestRow {
  return {
    userId: "user-1",
    requestedAt: new Date(),
    scheduledFor: new Date(),
    status: "pending",
    ...overrides,
  };
}

function createFakeRepo() {
  const state = {
    exports: new Map<string, ExportRequestRow>(),
    deletions: new Map<string, DeletionRequestRow>(),
    events: [] as Array<{ type: string; payload: unknown }>,
    nextId: 1,
  };

  function newId() {
    return `id-${state.nextId++}`;
  }

  const repo: GdprRepository = {
    async withTransaction(fn) {
      return fn(undefined);
    },
    async findActiveExportRequest(userId) {
      return (
        [...state.exports.values()].find(
          (r) => r.userId === userId && (r.status === "pending" || r.status === "processing"),
        ) ?? null
      );
    },
    async insertExportRequest(userId) {
      const row = makeExportRow({ id: newId(), userId });
      state.exports.set(row.id, row);
      return row;
    },
    async latestExportRequest(userId) {
      const rows = [...state.exports.values()]
        .filter((r) => r.userId === userId)
        .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
      return rows[0] ?? null;
    },
    async claimExportRequest(requestId) {
      const row = state.exports.get(requestId);
      if (!row || row.status !== "pending") return null;
      row.status = "processing";
      return row;
    },
    async markExportReady(requestId, fields) {
      const row = state.exports.get(requestId);
      if (!row) return;
      row.status = "ready";
      row.storageKey = fields.storageKey;
      row.expiresAt = fields.expiresAt;
      row.completedAt = new Date();
    },
    async markExportFailed(requestId) {
      const row = state.exports.get(requestId);
      if (row) row.status = "failed";
    },
    async listExpiredExports() {
      const now = new Date();
      return [...state.exports.values()].filter(
        (r) => r.status === "ready" && r.expiresAt && r.expiresAt <= now,
      );
    },
    async markExportExpired(requestId) {
      const row = state.exports.get(requestId);
      if (row) row.status = "expired";
    },
    async findPendingDeletion(userId) {
      return (
        [...state.deletions.values()].find((d) => d.userId === userId && d.status === "pending") ??
        null
      );
    },
    async insertDeletionRequest(userId, scheduledFor) {
      const row = makeDeletionRow({ id: newId(), userId, scheduledFor });
      state.deletions.set(row.id, row);
      return row;
    },
    async cancelDeletionRequest(userId) {
      const row = [...state.deletions.values()].find(
        (d) => d.userId === userId && d.status === "pending",
      );
      if (!row) return null;
      row.status = "cancelled";
      return row;
    },
    async selectDueDeletionsForUpdate() {
      const now = new Date();
      return [...state.deletions.values()].filter(
        (d) => d.status === "pending" && d.scheduledFor <= now,
      );
    },
    async markDeletionCompleted(id) {
      const row = state.deletions.get(id);
      if (row) row.status = "completed";
    },
    async anonymizeUser(userId) {
      const exportKeys = [...state.exports.values()]
        .filter((r) => r.userId === userId && r.storageKey)
        .map((r) => r.storageKey as string);
      return { avatarKey: `avatars/${userId}/avatar.webp`, exportKeys };
    },
    async writeEvent(envelope) {
      state.events.push({ type: envelope.type, payload: envelope.payload });
    },
  };

  return { repo, state };
}

function createFakeStorage() {
  const calls = {
    put: [] as string[],
    delete: [] as string[],
    objects: new Map<string, string>(),
  };

  const storage: StorageProvider = {
    async ensureBucket() {},
    async putObject(key, body) {
      calls.put.push(key);
      calls.objects.set(key, new TextDecoder().decode(body));
    },
    async getObject(key) {
      const value = calls.objects.get(key);
      if (value === undefined) throw new Error("not found");
      return new TextEncoder().encode(value);
    },
    async deleteObject(key) {
      calls.delete.push(key);
      calls.objects.delete(key);
    },
    async getSignedDownloadUrl(key) {
      return `https://storage.test/${key}`;
    },
  };

  return { storage, calls };
}

function createStubSections(): ExportSection[] {
  return [
    { name: "sectionA", collect: async () => ({ a: 1 }) },
    { name: "sectionB", collect: async () => ({ b: 2 }) },
  ];
}

describe("gdpr service requestExport", () => {
  it("writes a row and an outbox envelope of type gdpr.export.requested in one transaction", async () => {
    const { repo, state } = createFakeRepo();
    const { storage } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    const row = await service.requestExport("user-1");

    expect(row.userId).toBe("user-1");
    expect(state.events).toEqual([
      { type: "gdpr.export.requested", payload: { requestId: row.id, userId: "user-1" } },
    ]);
  });

  it("throws ConflictError when a request is already pending", async () => {
    const { repo } = createFakeRepo();
    const { storage } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    await service.requestExport("user-1");

    await expect(service.requestExport("user-1")).rejects.toMatchObject({
      i18nKey: "gdpr.export.alreadyPending",
    });
  });
});

describe("gdpr service runExport", () => {
  it("claims, writes an object whose JSON has both section names, and marks ready with expiresAt ~ now+7d", async () => {
    const { repo } = createFakeRepo();
    const { storage, calls } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    const row = await service.requestExport("user-1");
    await service.runExport(row.id);

    expect(calls.put).toHaveLength(1);
    const written = JSON.parse(calls.objects.get(calls.put[0] as string) as string);
    expect(Object.keys(written.sections)).toEqual(["sectionA", "sectionB"]);

    const status = await service.getExportStatus("user-1");
    expect(status?.status).toBe("ready");
    const expectedExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
    expect(status?.expiresAt?.getTime()).toBeGreaterThan(expectedExpiry - 5000);
    expect(status?.expiresAt?.getTime()).toBeLessThan(expectedExpiry + 5000);
  });

  it("is a no-op when the request is already processing (claim returns null)", async () => {
    const { repo, state } = createFakeRepo();
    const { storage, calls } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    const row = await service.requestExport("user-1");
    const stateRow = state.exports.get(row.id);
    if (stateRow) stateRow.status = "processing";

    await service.runExport(row.id);

    expect(calls.put).toHaveLength(0);
  });

  it("marks the request failed without throwing when a section throws", async () => {
    const { repo } = createFakeRepo();
    const { storage } = createFakeStorage();
    const throwingSections: ExportSection[] = [
      {
        name: "broken",
        collect: async () => {
          throw new Error("boom");
        },
      },
    ];
    const service = createGdprService({ repo, storage, sections: throwingSections });

    const row = await service.requestExport("user-1");
    await expect(service.runExport(row.id)).resolves.toBeUndefined();

    const status = await service.getExportStatus("user-1");
    expect(status?.status).toBe("failed");
  });
});

describe("gdpr service requestDeletion / cancelDeletion", () => {
  it("sets scheduledFor ~ now+30d, conflicts on a second request", async () => {
    const { repo } = createFakeRepo();
    const { storage } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    const row = await service.requestDeletion("user-1");
    const expectedSchedule = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(row.scheduledFor.getTime()).toBeGreaterThan(expectedSchedule - 5000);
    expect(row.scheduledFor.getTime()).toBeLessThan(expectedSchedule + 5000);

    await expect(service.requestDeletion("user-1")).rejects.toMatchObject({
      i18nKey: "gdpr.deletion.alreadyPending",
    });
  });

  it("cancel flips pending to cancelled; cancelling with none throws NotFoundError", async () => {
    const { repo } = createFakeRepo();
    const { storage } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    await service.requestDeletion("user-1");
    const cancelled = await service.cancelDeletion("user-1");
    expect(cancelled.status).toBe("cancelled");

    await expect(service.cancelDeletion("user-1")).rejects.toMatchObject({
      i18nKey: "gdpr.deletion.notFound",
    });
  });
});

describe("gdpr service sweep", () => {
  it("runs the executor for a due deletion, marks completed, and requests deletion of avatar + export keys", async () => {
    const { repo, state } = createFakeRepo();
    const { storage, calls } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    const exportRow = await service.requestExport("user-1");
    await service.runExport(exportRow.id);

    const deletion = await service.requestDeletion("user-1");
    const stateDeletion = state.deletions.get(deletion.id);
    if (stateDeletion) stateDeletion.scheduledFor = new Date(Date.now() - 1000);

    const result = await service.sweep();

    expect(result.deletionsExecuted).toBe(1);
    expect(state.deletions.get(deletion.id)?.status).toBe("completed");
    expect(calls.delete).toEqual(expect.arrayContaining(["avatars/user-1/avatar.webp"]));
  });

  it("ignores future-scheduled deletion rows", async () => {
    const { repo } = createFakeRepo();
    const { storage } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    await service.requestDeletion("user-1");

    const result = await service.sweep();
    expect(result.deletionsExecuted).toBe(0);
  });

  it("expires an overdue ready export", async () => {
    const { repo, state } = createFakeRepo();
    const { storage, calls } = createFakeStorage();
    const service = createGdprService({ repo, storage, sections: createStubSections() });

    const exportRow = await service.requestExport("user-1");
    await service.runExport(exportRow.id);
    const stateRow = state.exports.get(exportRow.id);
    if (stateRow) stateRow.expiresAt = new Date(Date.now() - 1000);

    const result = await service.sweep();

    expect(result.exportsExpired).toBe(1);
    expect(state.exports.get(exportRow.id)?.status).toBe("expired");
    expect(calls.delete.length).toBeGreaterThan(0);
  });
});
