import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createIdentityRepository, createIdentityService, loadEnv } from "@surffit/core";
import { createDb, schema } from "@surffit/db";
import type { NextAuthConfig } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Discord from "next-auth/providers/discord";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const identityService = createIdentityService(createIdentityRepository(db));

// DrizzleAdapter's overloaded signature requires columnType "PgText" | "PgVarchar",
// but our citext custom type reports "PgCustomColumn" — a TS-only mismatch (citext
// behaves identically to text at the query-building/runtime level). Going through
// an untyped callable sidesteps TS's overload resolution instead of fighting it.
const untypedDrizzleAdapter = DrizzleAdapter as unknown as (...args: unknown[]) => Adapter;
const adapter = untypedDrizzleAdapter(db, {
  usersTable: schema.users,
  accountsTable: schema.accounts,
  sessionsTable: schema.sessions,
});

export const authConfig: NextAuthConfig = {
  adapter,
  session: { strategy: "database" },
  trustHost: true,
  providers: [
    Discord({
      clientId: env.AUTH_DISCORD_ID,
      clientSecret: env.AUTH_DISCORD_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      const dbUser = user as typeof user & {
        username: string | null;
        onboardedAt: Date | null;
      };

      return {
        ...session,
        user: {
          id: dbUser.id,
          username: dbUser.username,
          displayName: dbUser.name,
          onboarded: dbUser.onboardedAt !== null,
        },
      };
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await identityService.onUserCreated(user.id, { locale: "en" });
    },
  },
};
