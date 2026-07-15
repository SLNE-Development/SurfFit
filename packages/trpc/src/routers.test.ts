import { describe, expect, it } from "vitest";
import type { Context } from "./context";
import { appRouter } from "./routers";

const fakeLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Context["logger"];

const fakeDb = {} as Context["db"];
const fakeStorage = {} as Context["storage"];

function makeContext(session: Context["session"] = null): Context {
  return { session, db: fakeDb, logger: fakeLogger, storage: fakeStorage };
}

describe("profile router", () => {
  it("rejects anonymous profile.update with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(
      caller.profile.update({ displayName: "New Name", biography: null }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("settings router", () => {
  it("rejects anonymous settings.preferences with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(caller.settings.preferences()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects settings.updatePreferences input {firstWeekday: 9} with BAD_REQUEST mentioning validation.preferences.range", async () => {
    const caller = appRouter.createCaller(makeContext({ user: { id: "user-1" } }));
    await expect(caller.settings.updatePreferences({ firstWeekday: 9 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    try {
      await caller.settings.updatePreferences({ firstWeekday: 9 });
      expect.unreachable("expected updatePreferences to throw");
    } catch (err) {
      expect(String((err as Error).message)).toContain("validation.preferences.range");
    }
  });
});

describe("exercises router", () => {
  it("rejects anonymous exercises.submitMovement with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(
      caller.exercises.submitMovement({ name: "Bench Press", difficulty: "beginner" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects exercises.search with limit 500 with BAD_REQUEST before touching the db", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(
      caller.exercises.search({ locale: "en", query: "bench", limit: 500 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("marks filters/movements/search as public authz meta", () => {
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { meta?: { authz?: string } } }
    >;
    expect(procedures["exercises.filters"]?._def.meta?.authz).toBe("public");
    expect(procedures["exercises.movements"]?._def.meta?.authz).toBe("public");
    expect(procedures["exercises.search"]?._def.meta?.authz).toBe("public");
  });
});

describe("gyms router", () => {
  it("rejects anonymous gyms.create with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(
      caller.gyms.create({ name: "Iron Paradise", city: "Berlin", countryCode: "de" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("marks gyms.search as public authz meta", () => {
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { meta?: { authz?: string } } }
    >;
    expect(procedures["gyms.search"]?._def.meta?.authz).toBe("public");
  });
});

describe("moderation router", () => {
  it("rejects every moderation procedure anonymously with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));

    await expect(caller.moderation.queue()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.moderation.review({
        subjectType: "movement",
        subjectId: "m1",
        decision: "approve",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      caller.moderation.report({ subjectType: "movement", subjectId: "m1", reason: "spam" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.moderation.reports({ status: "open" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller.moderation.resolveReport({ reportId: "r1", resolution: "resolved" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects moderation.review decision 'delete' with BAD_REQUEST", async () => {
    const caller = appRouter.createCaller(makeContext({ user: { id: "user-1" } }));
    await expect(
      caller.moderation.review({
        subjectType: "movement",
        subjectId: "m1",
        decision: "delete" as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("marks all five moderation procedures with session authz meta", () => {
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { meta?: { authz?: string } } }
    >;
    for (const path of [
      "moderation.queue",
      "moderation.review",
      "moderation.report",
      "moderation.reports",
      "moderation.resolveReport",
    ]) {
      expect(procedures[path]?._def.meta?.authz).toBe("session");
    }
  });
});

describe("gdpr router", () => {
  it("rejects every gdpr procedure anonymously with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));

    await expect(caller.gdpr.requestExport()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.gdpr.exportStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.gdpr.requestDeletion()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.gdpr.cancelDeletion()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.gdpr.deletionStatus()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.gdpr.consents()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
