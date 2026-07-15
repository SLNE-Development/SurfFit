import { schema } from "@surffit/db";
import type { Db } from "@surffit/db";
import { and, asc, count, eq, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { FALLBACK_LOCALE } from "../locale";
import { writeOutbox } from "../outbox/write";
import type { GymsRepository } from "./service";

const { gyms, gymEquipment, gymMembers, equipment, equipmentTranslations, userRoles } = schema;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function loadEquipmentList(db: Db, gymId: string, locale: string) {
  const reqT = alias(equipmentTranslations, "req_t");
  const enT = alias(equipmentTranslations, "en_t");
  return db
    .select({
      id: gymEquipment.id,
      label: gymEquipment.label,
      notes: gymEquipment.notes,
      equipmentSlug: equipment.slug,
      equipmentName: sql<string>`coalesce(${reqT.name}, ${enT.name})`,
    })
    .from(gymEquipment)
    .innerJoin(equipment, eq(equipment.id, gymEquipment.equipmentId))
    .leftJoin(reqT, and(eq(reqT.equipmentId, equipment.id), eq(reqT.locale, locale)))
    .innerJoin(enT, and(eq(enT.equipmentId, equipment.id), eq(enT.locale, FALLBACK_LOCALE)))
    .where(eq(gymEquipment.gymId, gymId));
}

export function createGymsRepository(db: Db): GymsRepository {
  return {
    async getUserRoles(userId) {
      const rows = await db
        .select({ role: userRoles.role })
        .from(userRoles)
        .where(eq(userRoles.userId, userId));
      return rows.map((r) => r.role);
    },

    async withTransaction(fn) {
      return db.transaction((tx) => fn(tx));
    },

    async insertGym(input, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      const [row] = await executor
        .insert(gyms)
        .values({
          name: input.name,
          description: input.description,
          city: input.city,
          countryCode: input.countryCode,
          address: input.address,
          ownerUserId: input.ownerUserId,
          status: "pending",
        })
        .returning({ id: gyms.id });
      if (!row) throw new Error("failed to insert gym");
      return row;
    },

    async writeEvent(envelope, tx) {
      await writeOutbox(tx as Tx, envelope);
    },

    async findGymById(gymId) {
      const [row] = await db
        .select({
          id: gyms.id,
          ownerUserId: gyms.ownerUserId,
          status: gyms.status,
          deletedAt: gyms.deletedAt,
        })
        .from(gyms)
        .where(eq(gyms.id, gymId));
      return row ?? null;
    },

    async getGymDetail(gymId, locale) {
      const [gymRow] = await db.select().from(gyms).where(eq(gyms.id, gymId));
      if (!gymRow || gymRow.deletedAt) return null;

      const equipmentRows = await loadEquipmentList(db, gymId, locale);
      const [memberCountRow] = await db
        .select({ count: count() })
        .from(gymMembers)
        .where(eq(gymMembers.gymId, gymId));

      return {
        id: gymRow.id,
        name: gymRow.name,
        description: gymRow.description,
        city: gymRow.city,
        countryCode: gymRow.countryCode,
        address: gymRow.address,
        status: gymRow.status,
        ownerUserId: gymRow.ownerUserId,
        memberCount: memberCountRow?.count ?? 0,
        equipment: equipmentRows,
      };
    },

    async searchGyms(params) {
      const conditions = [isNull(gyms.deletedAt)];
      const visibility = params.viewerId
        ? (or(eq(gyms.status, "approved"), eq(gyms.ownerUserId, params.viewerId)) ??
          eq(gyms.status, "approved"))
        : eq(gyms.status, "approved");
      conditions.push(visibility);

      if (params.query) {
        conditions.push(
          sql`(${gyms.search} @@ websearch_to_tsquery('simple', ${params.query})
            or ${gyms.name} ilike ${`${params.query}%`})`,
        );
      }

      const memberCountSubquery = db
        .select({ gymId: gymMembers.gymId, memberCount: count().as("member_count") })
        .from(gymMembers)
        .groupBy(gymMembers.gymId)
        .as("member_counts");

      const rows = await db
        .select({
          id: gyms.id,
          name: gyms.name,
          city: gyms.city,
          countryCode: gyms.countryCode,
          status: gyms.status,
          ownerUserId: gyms.ownerUserId,
          memberCount: sql<number>`coalesce(${memberCountSubquery.memberCount}, 0)`,
        })
        .from(gyms)
        .leftJoin(memberCountSubquery, eq(memberCountSubquery.gymId, gyms.id))
        .where(and(...conditions))
        .orderBy(asc(gyms.name))
        .limit(params.limit);

      return rows;
    },

    async updateGym(gymId, partial) {
      await db
        .update(gyms)
        .set({ ...partial, updatedAt: new Date() })
        .where(eq(gyms.id, gymId));
    },

    async insertGymEquipment(input) {
      const [row] = await db
        .insert(gymEquipment)
        .values({
          gymId: input.gymId,
          equipmentId: input.equipmentId,
          label: input.label,
          notes: input.notes,
        })
        .returning({ id: gymEquipment.id });
      if (!row) throw new Error("failed to insert gym equipment");
      return row;
    },

    async deleteGymEquipment(gymId, gymEquipmentId) {
      const result = await db
        .delete(gymEquipment)
        .where(and(eq(gymEquipment.id, gymEquipmentId), eq(gymEquipment.gymId, gymId)))
        .returning({ id: gymEquipment.id });
      return result.length > 0;
    },

    async insertMember(gymId, userId) {
      await db.insert(gymMembers).values({ gymId, userId });
    },

    async deleteMember(gymId, userId) {
      const result = await db
        .delete(gymMembers)
        .where(and(eq(gymMembers.gymId, gymId), eq(gymMembers.userId, userId)))
        .returning({ gymId: gymMembers.gymId });
      return result.length > 0;
    },

    async isMember(gymId, userId) {
      const rows = await db
        .select({ gymId: gymMembers.gymId })
        .from(gymMembers)
        .where(and(eq(gymMembers.gymId, gymId), eq(gymMembers.userId, userId)));
      return rows.length > 0;
    },

    async memberCount(gymId) {
      const [row] = await db
        .select({ count: count() })
        .from(gymMembers)
        .where(eq(gymMembers.gymId, gymId));
      return row?.count ?? 0;
    },

    async listMyGyms(userId) {
      const memberCountSubquery = db
        .select({ gymId: gymMembers.gymId, memberCount: count().as("member_count") })
        .from(gymMembers)
        .groupBy(gymMembers.gymId)
        .as("member_counts");

      const rows = await db
        .select({
          id: gyms.id,
          name: gyms.name,
          city: gyms.city,
          countryCode: gyms.countryCode,
          status: gyms.status,
          ownerUserId: gyms.ownerUserId,
          memberCount: sql<number>`coalesce(${memberCountSubquery.memberCount}, 0)`,
        })
        .from(gyms)
        .leftJoin(memberCountSubquery, eq(memberCountSubquery.gymId, gyms.id))
        .where(
          and(
            isNull(gyms.deletedAt),
            or(
              eq(gyms.ownerUserId, userId),
              sql`exists (select 1 from gym_members gm where gm.gym_id = ${gyms.id} and gm.user_id = ${userId})`,
            ),
          ),
        )
        .orderBy(asc(gyms.name));

      return rows;
    },

    async equipmentExists(equipmentId) {
      const rows = await db
        .select({ id: equipment.id })
        .from(equipment)
        .where(eq(equipment.id, equipmentId));
      return rows.length > 0;
    },
  };
}
