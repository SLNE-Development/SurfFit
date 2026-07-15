import { schema } from "@surffit/db";
import type { Db } from "@surffit/db";
import { eq } from "drizzle-orm";
import { writeOutbox } from "../outbox/write";
import type { IdentityRepository } from "./service";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function createIdentityRepository(db: Db): IdentityRepository {
  return {
    async withTransaction(fn) {
      return db.transaction((tx) => fn(tx));
    },
    async hasPreferences(userId, tx) {
      const rows = await (tx as Tx)
        .select({ userId: schema.userPreferences.userId })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId));
      return rows.length > 0;
    },
    async insertDefaultPreferences(userId, tx) {
      await (tx as Tx).insert(schema.userPreferences).values({ userId });
    },
    async insertDefaultPrivacySettings(userId, tx) {
      await (tx as Tx).insert(schema.privacySettings).values({ userId });
    },
    async writeEvent(envelope, tx) {
      await writeOutbox(tx as Tx, envelope);
    },
  };
}
