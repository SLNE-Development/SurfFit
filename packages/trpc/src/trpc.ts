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

export type AuthzMeta = {
  authz: "public" | "session";
};

const t = initTRPC
  .context<Context>()
  .meta<AuthzMeta>()
  .create({
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

const authzGuard = t.middleware(({ meta, ctx, next }) => {
  if (meta?.authz === undefined) {
    throw new TRPCError({ code: "FORBIDDEN", message: "authz.unannotated" });
  }

  if (meta.authz === "session" && !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next();
});

export const guardedProcedure = t.procedure.use(authzGuard);

export const publicProcedure = guardedProcedure
  .meta({ authz: "public" })
  .use(async ({ ctx, next, path }) => {
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
        // Attach `data` directly: errorFormatter (which builds the shape
        // fetchRequestHandler serializes) only runs over the HTTP link, not
        // for direct createCaller() calls — callers need `data.i18nKey` either way.
        const mappedError = new TRPCError({
          code,
          message: domainError.message,
          cause: domainError,
        });
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

export const protectedProcedure = publicProcedure
  .meta({ authz: "session" })
  .use(({ ctx, next }) => {
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
