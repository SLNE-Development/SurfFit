import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { newId } from "./ids";
import { runMigrations } from "./migrate";
import { outboxEvents, users } from "./schema";

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
