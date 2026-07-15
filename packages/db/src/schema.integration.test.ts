import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { newId } from "./ids";
import { runMigrations } from "./migrate";
import { accountDeletionRequests, dataExportRequests, outboxEvents, users } from "./schema";

let container: StartedPostgreSqlContainer;
let db: ReturnType<typeof createDb>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const connectionString = container.getConnectionUri();
  await runMigrations(connectionString);
  db = createDb(connectionString);
}, 120_000);

afterAll(async () => {
  await db.$client.end();
  await container.stop();
});

describe("identity schema", () => {
  it("creates all eight tables", async () => {
    const result = await db.execute<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tableNames = result.rows.map((row) => row.table_name);

    expect(tableNames).toEqual(
      expect.arrayContaining([
        "users",
        "accounts",
        "sessions",
        "user_preferences",
        "privacy_settings",
        "user_roles",
        "user_consents",
        "outbox_events",
        "data_export_requests",
        "account_deletion_requests",
      ]),
    );
  });

  it("allows inserting a user with newId() and a null username", async () => {
    const id = newId();

    await db.insert(users).values({
      id,
      displayName: "Test User",
      email: `${id}@example.com`,
    });

    const [row] = await db.select().from(users).where(eq(users.id, id));

    expect(row?.username).toBeNull();
  });

  it("rejects usernames differing only by case (citext unique)", async () => {
    const idA = newId();
    const idB = newId();

    await db.insert(users).values({
      id: idA,
      username: "SurfFan",
      displayName: "A",
      email: `${idA}@example.com`,
    });

    await expect(
      db.insert(users).values({
        id: idB,
        username: "surffan",
        displayName: "B",
        email: `${idB}@example.com`,
      }),
    ).rejects.toThrow();
  });

  it("inserts an outbox row with default attempts of 0", async () => {
    const id = newId();

    await db.insert(outboxEvents).values({
      id,
      eventType: "test.event",
      schemaVersion: 1,
      payload: { hello: "world" },
    });

    const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.id, id));

    expect(row?.attempts).toBe(0);
  });
});

describe("gdpr schema", () => {
  it("inserts a data export request defaulting to pending status", async () => {
    const userId = newId();
    await db.insert(users).values({
      id: userId,
      displayName: "GDPR User",
      email: `${userId}@example.com`,
    });

    const requestId = newId();
    await db.insert(dataExportRequests).values({
      id: requestId,
      userId,
    });

    const [row] = await db
      .select()
      .from(dataExportRequests)
      .where(eq(dataExportRequests.id, requestId));

    expect(row?.status).toBe("pending");
  });

  it("rejects an invalid export status value", async () => {
    const userId = newId();
    await db.insert(users).values({
      id: userId,
      displayName: "GDPR User 2",
      email: `${userId}@example.com`,
    });

    await expect(
      db.execute(
        `insert into data_export_requests (id, user_id, status) values ('${newId()}', '${userId}', 'bogus')`,
      ),
    ).rejects.toThrow();
  });

  it("inserts a deletion request and rejects an invalid deletion status value", async () => {
    const userId = newId();
    await db.insert(users).values({
      id: userId,
      displayName: "GDPR User 3",
      email: `${userId}@example.com`,
    });

    const requestId = newId();
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(accountDeletionRequests).values({
      id: requestId,
      userId,
      scheduledFor,
    });

    const [row] = await db
      .select()
      .from(accountDeletionRequests)
      .where(eq(accountDeletionRequests.id, requestId));

    expect(row?.status).toBe("pending");

    await expect(
      db.execute(
        `insert into account_deletion_requests (id, user_id, scheduled_for, status) values ('${newId()}', '${userId}', now(), 'bogus')`,
      ),
    ).rejects.toThrow();
  });
});
