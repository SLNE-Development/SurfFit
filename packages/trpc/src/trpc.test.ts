import { ConflictError } from "@surffit/core";
import { describe, expect, it } from "vitest";
import type { Context } from "./context";
import { appRouter } from "./routers";
import { protectedProcedure, publicProcedure, router } from "./trpc";

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

const testRouter = router({
  protectedPing: protectedProcedure.query(() => ({ ok: true })),
  throwConflict: publicProcedure.query(() => {
    throw new ConflictError("x.y");
  }),
});

describe("trpc router", () => {
  it("health.ping works with anonymous context", async () => {
    const caller = appRouter.createCaller(makeContext());
    await expect(caller.health.ping()).resolves.toEqual({ ok: true });
  });

  it("rejects a protected procedure with UNAUTHORIZED when session is null", async () => {
    const caller = testRouter.createCaller(makeContext(null));
    await expect(caller.protectedPing()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("surfaces ConflictError as CONFLICT with i18nKey attached", async () => {
    const caller = testRouter.createCaller(makeContext());
    await expect(caller.throwConflict()).rejects.toMatchObject({
      code: "CONFLICT",
      data: { i18nKey: "x.y" },
    });
  });
});
