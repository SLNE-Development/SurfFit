import { ConflictError } from "@surffit/core";
import { describe, expect, it } from "vitest";
import type { Context } from "./context";
import { appRouter } from "./routers";
import { guardedProcedure, protectedProcedure, publicProcedure, router } from "./trpc";

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
  unannotated: guardedProcedure.query(() => ({ ok: true })),
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

  it("rejects an anonymous identity.claimUsername call with UNAUTHORIZED", async () => {
    const caller = appRouter.createCaller(makeContext(null));
    await expect(
      caller.identity.claimUsername({ username: "surffan", acceptPolicies: true }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects identity.claimUsername with the old ({username} only) input shape via Zod", async () => {
    const caller = appRouter.createCaller(makeContext({ user: { id: "user-1" } }));
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: intentionally passing a legacy input shape
      caller.identity.claimUsername({ username: "surffan" } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a procedure with no authz meta with FORBIDDEN", async () => {
    const caller = testRouter.createCaller(makeContext());
    await expect(caller.unannotated()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
