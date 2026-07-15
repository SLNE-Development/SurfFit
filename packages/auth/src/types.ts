import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
      displayName: string | null;
      onboarded: boolean;
    } & DefaultSession["user"];
  }
}
