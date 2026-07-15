import { db } from "@/lib/db";
import { createLogger } from "@surffit/core";
import { appRouter, createContext } from "@surffit/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createContext({
        // TODO(Task 11): resolve the real session via auth() once @surffit/auth exists.
        session: null,
        db,
        logger: createLogger("trpc"),
      }),
  });
}

export { handler as GET, handler as POST };
