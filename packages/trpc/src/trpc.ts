import {
  ConflictError,
  DomainError,
  DomainRuleViolationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitedError,
} from "@surffit/core";
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const DOMAIN_ERROR_CODE_MAP = new Map<new (...args: never[]) => DomainError, TRPCError["code"]>([
  [NotFoundError, "NOT_FOUND"],
  [PermissionDeniedError, "FORBIDDEN"],
  [ConflictError, "CONFLICT"],
  [RateLimitedError, "TOO_MANY_REQUESTS"],
  [DomainRuleViolationError, "BAD_REQUEST"],
]);

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const cause = error.cause;

    if (cause instanceof DomainError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          i18nKey: cause.i18nKey,
          params: cause.params,
        },
      };
    }

    return shape;
  },
});

export const router = t.router;

export const publicProcedure = t.procedure.use(async ({ ctx, next, path }) => {
  const result = await next({ ctx });

  if (!result.ok) {
    const error = result.error;
    const domainError =
      error instanceof DomainError
        ? error
        : error.cause instanceof DomainError
          ? error.cause
          : undefined;

    if (domainError) {
      const ErrorClass = domainError.constructor as new (...args: never[]) => DomainError;
      const code = DOMAIN_ERROR_CODE_MAP.get(ErrorClass) ?? "INTERNAL_SERVER_ERROR";
      const mappedError = new TRPCError({ code, message: domainError.message, cause: domainError });
      Object.assign(mappedError, {
        data: { i18nKey: domainError.i18nKey, params: domainError.params },
      });
      throw mappedError;
    }

    if (error.code === "INTERNAL_SERVER_ERROR") {
      ctx.logger.error({ err: error, path }, "trpc procedure failed");
    }
  }

  return result;
});

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  });
});
