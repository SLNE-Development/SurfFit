import { db } from "@/lib/db";
import { auth } from "@surffit/auth";
import { createLogger } from "@surffit/core";
import { appRouter, createContext } from "@surffit/trpc";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

function handler(req: Request) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: async () => {
      const session = await auth();

      return createContext({
        session: session?.user ? { user: { id: session.user.id } } : null,
        db,
        logger: createLogger("trpc"),
      });
    },
  });
}

export { handler as GET, handler as POST };
