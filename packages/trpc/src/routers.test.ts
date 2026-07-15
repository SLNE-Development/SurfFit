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

function makeContext(session: Context["session"] = null): Context {
  return { session, db: fakeDb, logger: fakeLogger };
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
