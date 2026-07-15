import type { createLogger } from "@surffit/core";
import type { Db } from "@surffit/db";

export type Session = {
  user: { id: string };
} | null;

export type Context = {
  session: Session;
  db: Db;
  logger: ReturnType<typeof createLogger>;
};

export function createContext(opts: Context): Context {
  return opts;
}
