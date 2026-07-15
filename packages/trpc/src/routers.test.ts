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
