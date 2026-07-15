import { isUniqueViolation, schema } from "@surffit/db";
import type { Db } from "@surffit/db";
import { and, eq, isNull } from "drizzle-orm";
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
    async getOnboardingStatus(userId, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      const [row] = await executor
        .select({ onboardedAt: schema.users.onboardedAt })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      return row ?? null;
    },
    async setUsername(userId, username, tx) {
      const executor = (tx as Tx | undefined) ?? db;
      try {
        await executor
          .update(schema.users)
          .set({ username, onboardedAt: new Date() })
          .where(eq(schema.users.id, userId));
        return "ok";
      } catch (error) {
        if (isUniqueViolation(error)) return "taken";
        throw error;
      }
    },
    async isUsernameTaken(username) {
      const rows = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.username, username));
      return rows.length > 0;
    },
    async findProfileByUsername(username) {
      const [row] = await db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          displayName: schema.users.displayName,
          biography: schema.users.biography,
          avatarKey: schema.users.avatarKey,
          createdAt: schema.users.createdAt,
          visibility: schema.privacySettings.profileVisibility,
        })
        .from(schema.users)
        .innerJoin(schema.privacySettings, eq(schema.privacySettings.userId, schema.users.id))
        .where(
          and(
            eq(schema.users.username, username),
            isNull(schema.users.deletedAt),
            isNull(schema.users.anonymizedAt),
          ),
        );
      return row ?? null;
    },
    async findUserById(userId) {
      const [row] = await db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          displayName: schema.users.displayName,
          biography: schema.users.biography,
          avatarKey: schema.users.avatarKey,
          email: schema.users.email,
          locale: schema.users.locale,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      return row ?? null;
    },
    async getUserRoles(userId) {
      const rows = await db
        .select({ role: schema.userRoles.role })
        .from(schema.userRoles)
        .where(eq(schema.userRoles.userId, userId));
      return rows.map((r) => r.role);
    },
    async getPreferences(userId) {
      const [row] = await db
        .select({
          unitSystem: schema.userPreferences.unitSystem,
          theme: schema.userPreferences.theme,
          firstWeekday: schema.userPreferences.firstWeekday,
          defaultRestSeconds: schema.userPreferences.defaultRestSeconds,
        })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId));
      return row ?? null;
    },
    async updatePreferences(userId, partial) {
      await db
        .update(schema.userPreferences)
        .set({ ...partial, updatedAt: new Date() })
        .where(eq(schema.userPreferences.userId, userId));
      const [row] = await db
        .select({
          unitSystem: schema.userPreferences.unitSystem,
          theme: schema.userPreferences.theme,
          firstWeekday: schema.userPreferences.firstWeekday,
          defaultRestSeconds: schema.userPreferences.defaultRestSeconds,
        })
        .from(schema.userPreferences)
        .where(eq(schema.userPreferences.userId, userId));
      if (!row) throw new Error(`preferences not found for user ${userId}`);
      return row;
    },
    async getPrivacySettings(userId) {
      const [row] = await db
        .select({
          profileVisibility: schema.privacySettings.profileVisibility,
          showStatistics: schema.privacySettings.showStatistics,
          showAchievements: schema.privacySettings.showAchievements,
          showWorkouts: schema.privacySettings.showWorkouts,
          showBodyMetrics: schema.privacySettings.showBodyMetrics,
        })
        .from(schema.privacySettings)
        .where(eq(schema.privacySettings.userId, userId));
      return row ?? null;
    },
    async updatePrivacySettings(userId, partial) {
      await db
        .update(schema.privacySettings)
        .set({ ...partial, updatedAt: new Date() })
        .where(eq(schema.privacySettings.userId, userId));
      const [row] = await db
        .select({
          profileVisibility: schema.privacySettings.profileVisibility,
          showStatistics: schema.privacySettings.showStatistics,
          showAchievements: schema.privacySettings.showAchievements,
          showWorkouts: schema.privacySettings.showWorkouts,
          showBodyMetrics: schema.privacySettings.showBodyMetrics,
        })
        .from(schema.privacySettings)
        .where(eq(schema.privacySettings.userId, userId));
      if (!row) throw new Error(`privacy settings not found for user ${userId}`);
      return row;
    },
    async updateProfileFields(userId, fields) {
      await db
        .update(schema.users)
        .set({
          displayName: fields.displayName,
          biography: fields.biography,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
      const [row] = await db
        .select({
          id: schema.users.id,
          username: schema.users.username,
          displayName: schema.users.displayName,
          biography: schema.users.biography,
          avatarKey: schema.users.avatarKey,
          email: schema.users.email,
          locale: schema.users.locale,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      if (!row) throw new Error(`user not found ${userId}`);
      return row;
    },
    async setAvatarKey(userId, key) {
      const [previous] = await db
        .select({ avatarKey: schema.users.avatarKey })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
      await db
        .update(schema.users)
        .set({ avatarKey: key, updatedAt: new Date() })
        .where(eq(schema.users.id, userId));
      return { previousKey: previous?.avatarKey ?? null };
    },
    async insertConsents(userId, consents, tx) {
      if (consents.length === 0) return;
      const executor = (tx as Tx | undefined) ?? db;
      await executor.insert(schema.userConsents).values(
        consents.map((c) => ({
          userId,
          consentType: c.consentType,
          policyVersion: c.policyVersion,
        })),
      );
    },
    async listConsents(userId) {
      return db
        .select({
          consentType: schema.userConsents.consentType,
          policyVersion: schema.userConsents.policyVersion,
          grantedAt: schema.userConsents.grantedAt,
          revokedAt: schema.userConsents.revokedAt,
        })
        .from(schema.userConsents)
        .where(eq(schema.userConsents.userId, userId))
        .orderBy(schema.userConsents.grantedAt);
    },
  };
}
