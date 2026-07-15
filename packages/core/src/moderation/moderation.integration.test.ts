import { createDb, newId, runMigrations, schema } from "@surffit/db";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createModerationRepository } from "./repository";
import { createModerationService } from "./service";

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

describe("moderation module integration — the phase 3 pipeline proof", () => {
  it("queues, reviews, and reports across movements/exercises/gyms", async () => {
    const moderatorId = newId();
    await db
      .insert(schema.users)
      .values({ id: moderatorId, displayName: "Mod", email: `${moderatorId}@example.com` });
    await db.insert(schema.userRoles).values({ userId: moderatorId, role: "moderator" });

    const submitterId = newId();
    await db.insert(schema.users).values({
      id: submitterId,
      displayName: "Submitter",
      email: `${submitterId}@example.com`,
    });

    const movementId = newId();
    await db.insert(schema.movements).values({
      id: movementId,
      slug: `bench-${movementId}`,
      difficulty: "beginner",
      ownerUserId: submitterId,
      status: "pending",
    });
    await db
      .insert(schema.movementTranslations)
      .values({ movementId, locale: "en", name: "Bench Press" });

    const equipmentId = newId();
    await db.insert(schema.equipment).values({ id: equipmentId, slug: `barbell-${equipmentId}` });
    await db
      .insert(schema.equipmentTranslations)
      .values({ equipmentId, locale: "en", name: "Barbell" });

    const exerciseId = newId();
    await db.insert(schema.exercises).values({
      id: exerciseId,
      movementId,
      equipmentId,
      difficulty: "beginner",
      ownerUserId: submitterId,
      status: "pending",
    });
    await db.insert(schema.exerciseTranslations).values({
      exerciseId,
      locale: "en",
      name: "Bench Press (Barbell)",
    });

    const gymId = newId();
    await db.insert(schema.gyms).values({
      id: gymId,
      name: "Iron Paradise",
      city: "Berlin",
      countryCode: "DE",
      ownerUserId: submitterId,
      status: "pending",
    });

    const service = createModerationService(createModerationRepository(db));

    const queue = await service.getQueue(moderatorId);
    expect(queue.some((row) => row.subjectId === movementId)).toBe(true);
    expect(queue.some((row) => row.subjectId === exerciseId)).toBe(true);
    expect(queue.some((row) => row.subjectId === gymId)).toBe(true);

    await service.review(moderatorId, {
      subjectType: "movement",
      subjectId: movementId,
      decision: "approve",
    });

    const [movementRow] = await db
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, movementId));
    expect(movementRow?.status).toBe("approved");

    const actionRows = await db
      .select()
      .from(schema.moderationActions)
      .where(eq(schema.moderationActions.subjectId, movementId));
    expect(actionRows).toHaveLength(1);

    const moderatedOutbox = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, "content.moderated"));
    expect(moderatedOutbox.length).toBeGreaterThanOrEqual(1);

    await service.review(moderatorId, {
      subjectType: "gym",
      subjectId: gymId,
      decision: "reject",
    });

    const [gymRow] = await db.select().from(schema.gyms).where(eq(schema.gyms.id, gymId));
    expect(gymRow?.status).toBe("rejected");

    const reporterId = newId();
    await db
      .insert(schema.users)
      .values({ id: reporterId, displayName: "Reporter", email: `${reporterId}@example.com` });

    const report = await service.createReport(reporterId, {
      subjectType: "movement",
      subjectId: movementId,
      reason: "spam",
    });

    const reportsList = await service.listReports(moderatorId, { status: "open" });
    expect(reportsList.some((r) => r.id === report.id)).toBe(true);

    await service.resolveReport(moderatorId, { reportId: report.id, resolution: "resolved" });

    const resolvedReports = await service.listReports(moderatorId, { status: "resolved" });
    expect(resolvedReports.some((r) => r.id === report.id)).toBe(true);

    const reportCreatedOutbox = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.eventType, "report.created"));
    expect(reportCreatedOutbox.length).toBeGreaterThanOrEqual(1);
  });
});
