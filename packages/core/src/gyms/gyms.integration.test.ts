import { createDb, newId, runMigrations, schema } from "@surffit/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGymsRepository } from "./repository";
import { createGymsService } from "./service";

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

describe("gyms module integration", () => {
  it("round-trips create → approve(sql) → join/leave → search → equipment", async () => {
    const ownerId = newId();
    await db
      .insert(schema.users)
      .values({ id: ownerId, displayName: "Owner", email: `${ownerId}@example.com` });
    const memberId = newId();
    await db
      .insert(schema.users)
      .values({ id: memberId, displayName: "Member", email: `${memberId}@example.com` });

    const equipmentId = newId();
    await db.insert(schema.equipment).values({ id: equipmentId, slug: `barbell-${equipmentId}` });
    await db
      .insert(schema.equipmentTranslations)
      .values({ equipmentId, locale: "en", name: "Barbell" });

    const service = createGymsService(createGymsRepository(db));

    const created = await service.createGym(ownerId, {
      name: "Iron Paradise",
      city: "Munich",
      countryCode: "de",
    });
    expect(created.status).toBe("pending");

    const pendingGyms = await service.searchGyms({ id: ownerId }, {});
    expect(pendingGyms.some((g) => g.id === created.id)).toBe(true);

    const strangerId = newId();
    await db
      .insert(schema.users)
      .values({ id: strangerId, displayName: "Stranger", email: `${strangerId}@example.com` });
    const strangerView = await service.searchGyms({ id: strangerId }, {});
    expect(strangerView.some((g) => g.id === created.id)).toBe(false);

    await db.update(schema.gyms).set({ status: "approved" }).where(eq(schema.gyms.id, created.id));

    await service.joinGym(memberId, created.id);
    let detail = await service.getGymById({ id: memberId }, "en", created.id);
    expect(detail.memberCount).toBe(1);
    expect(detail.isMember).toBe(true);

    await service.leaveGym(memberId, created.id);
    detail = await service.getGymById({ id: memberId }, "en", created.id);
    expect(detail.memberCount).toBe(0);

    const fts = await service.searchGyms(null, { query: "Munich" });
    expect(fts.some((g) => g.id === created.id)).toBe(true);

    const equipmentRow = await service.addEquipment(ownerId, created.id, {
      equipmentId,
      label: "Rack A",
    });
    expect(equipmentRow.id).toBeTruthy();

    detail = await service.getGymById({ id: ownerId }, "en", created.id);
    expect(detail.equipment).toHaveLength(1);
    expect(detail.equipment[0]?.equipmentName).toBe("Barbell");

    const outboxRows = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, "content.submitted"));
    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
  });
});
