import { createDb, newId, runMigrations, schema } from "@surffit/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createIdentityExportSections } from "../identity/export";
import { createIdentityRepository } from "../identity/repository";
import type { StorageProvider } from "../storage/port";
import { createGdprRepository } from "./drizzle-repository";
import { createGdprService } from "./service";

let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof createDb>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  await runMigrations(container.getConnectionUri());
  db = createDb(container.getConnectionUri());
}, 120_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

function createFakeStorage() {
  const objects = new Map<string, string>();
  const deleted: string[] = [];

  const storage: StorageProvider = {
    async ensureBucket() {},
    async putObject(key, body) {
      objects.set(key, new TextDecoder().decode(body));
    },
    async getObject(key) {
      const value = objects.get(key);
      if (value === undefined) throw new Error("not found");
      return new TextEncoder().encode(value);
    },
    async deleteObject(key) {
      deleted.push(key);
      objects.delete(key);
    },
    async getSignedDownloadUrl(key) {
      return `https://storage.test/${key}`;
    },
  };

  return { storage, objects, deleted };
}

describe("gdpr sweep (integration)", () => {
  it("anonymizes a due deletion, removes related rows, keeps consents, expires exports, and writes user.deleted", async () => {
    const userId = newId();
    await db.insert(schema.users).values({
      id: userId,
      username: "sweepme",
      displayName: "Sweep Me",
      email: `${userId}@example.com`,
      avatarKey: `avatars/${userId}/avatar.webp`,
    });
    await db.insert(schema.userPreferences).values({ userId });
    await db.insert(schema.privacySettings).values({ userId });
    await db.insert(schema.sessions).values({
      sessionToken: newId(),
      userId,
      expires: new Date(Date.now() + 86_400_000),
    });
    await db.insert(schema.accounts).values({
      userId,
      type: "oauth",
      provider: "discord",
      providerAccountId: newId(),
    });
    await db.insert(schema.userConsents).values([
      { userId, consentType: "terms", policyVersion: "2026-07-15" },
      { userId, consentType: "privacy", policyVersion: "2026-07-15" },
    ]);
    await db.insert(schema.userRoles).values({ userId, role: "user" });

    const exportRequestId = newId();
    await db.insert(schema.dataExportRequests).values({
      id: exportRequestId,
      userId,
      status: "ready",
      storageKey: `exports/${userId}/${exportRequestId}.json`,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    const deletionRequestId = newId();
    await db.insert(schema.accountDeletionRequests).values({
      id: deletionRequestId,
      userId,
      scheduledFor: new Date(Date.now() - 1000),
    });

    const { storage, deleted } = createFakeStorage();
    const gdprRepo = createGdprRepository(db);
    const identityRepo = createIdentityRepository(db);
    const service = createGdprService({
      repo: gdprRepo,
      storage,
      sections: createIdentityExportSections(identityRepo),
    });

    const result = await service.sweep();
    expect(result.deletionsExecuted).toBe(1);

    const [userRow] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(userRow?.username).toBeNull();
    expect(userRow?.displayName).toBeNull();
    expect(userRow?.name).toBeNull();
    expect(userRow?.image).toBeNull();
    expect(userRow?.email).toBe(`deleted-${userId}@anonymized.invalid`);
    expect(userRow?.avatarKey).toBeNull();
    expect(userRow?.biography).toBeNull();
    expect(userRow?.anonymizedAt).not.toBeNull();
    expect(userRow?.deletedAt).not.toBeNull();

    const sessionRows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessionRows).toHaveLength(0);

    const accountRows = await db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    expect(accountRows).toHaveLength(0);

    const preferencesRows = await db
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId));
    expect(preferencesRows).toHaveLength(0);

    const privacyRows = await db
      .select()
      .from(schema.privacySettings)
      .where(eq(schema.privacySettings.userId, userId));
    expect(privacyRows).toHaveLength(0);

    const roleRows = await db
      .select()
      .from(schema.userRoles)
      .where(eq(schema.userRoles.userId, userId));
    expect(roleRows).toHaveLength(0);

    const consentRows = await db
      .select()
      .from(schema.userConsents)
      .where(eq(schema.userConsents.userId, userId));
    expect(consentRows).toHaveLength(2);

    const [exportRow] = await db
      .select()
      .from(schema.dataExportRequests)
      .where(eq(schema.dataExportRequests.id, exportRequestId));
    expect(exportRow?.status).toBe("expired");

    const [deletionRow] = await db
      .select()
      .from(schema.accountDeletionRequests)
      .where(eq(schema.accountDeletionRequests.id, deletionRequestId));
    expect(deletionRow?.status).toBe("completed");

    const outboxRows = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, "user.deleted"));
    expect(outboxRows.some((row) => (row.payload as { userId: string }).userId === userId)).toBe(
      true,
    );

    expect(deleted).toEqual(
      expect.arrayContaining([
        `avatars/${userId}/avatar.webp`,
        `exports/${userId}/${exportRequestId}.json`,
      ]),
    );

    const secondSweep = await service.sweep();
    expect(secondSweep).toEqual({ deletionsExecuted: 0, exportsExpired: 0 });
  });
});
