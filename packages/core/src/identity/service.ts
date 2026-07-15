import {
  preferencesUpdateSchema,
  privacyUpdateSchema,
  profileUpdateSchema,
  usernameSchema,
} from "@surffit/validation";
import type { Role } from "../authz/engine";
import { assertCan, can } from "../authz/engine";
import { ConflictError, DomainRuleViolationError, NotFoundError } from "../errors";
import type { EventEnvelope } from "../events/envelope";
import { userRegisteredEvent } from "../events/user-registered";
import { POLICY_VERSION, SIGNUP_CONSENT_TYPES } from "./consent";
import { manageOwnAccountPolicy, viewProfilePolicy } from "./policies";

export type ProfileVisibility = "public" | "following" | "private";
export type UnitSystem = "metric" | "imperial";
export type Theme = "dark" | "light" | "system";

export type ProfileRecord = {
  id: string;
  username: string | null;
  displayName: string | null;
  biography: string | null;
  avatarKey: string | null;
  createdAt: Date;
  visibility: ProfileVisibility;
};

export type UserRecord = {
  id: string;
  username: string | null;
  displayName: string | null;
  biography: string | null;
  avatarKey: string | null;
  email: string;
};

export type PreferencesRecord = {
  unitSystem: UnitSystem;
  theme: Theme;
  firstWeekday: number;
  defaultRestSeconds: number;
};

export type PrivacySettingsRecord = {
  profileVisibility: ProfileVisibility;
  showStatistics: boolean;
  showAchievements: boolean;
  showWorkouts: boolean;
  showBodyMetrics: boolean;
};

export type IdentityRepository = {
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  hasPreferences: (userId: string, tx: unknown) => Promise<boolean>;
  insertDefaultPreferences: (userId: string, tx: unknown) => Promise<void>;
  insertDefaultPrivacySettings: (userId: string, tx: unknown) => Promise<void>;
  writeEvent: (envelope: EventEnvelope, tx: unknown) => Promise<void>;
  getOnboardingStatus: (
    userId: string,
    tx?: unknown,
  ) => Promise<{ onboardedAt: Date | null } | null>;
  setUsername: (userId: string, username: string, tx?: unknown) => Promise<"ok" | "taken">;
  isUsernameTaken: (username: string) => Promise<boolean>;
  findProfileByUsername: (username: string) => Promise<ProfileRecord | null>;
  findUserById: (userId: string) => Promise<UserRecord | null>;
  getUserRoles: (userId: string) => Promise<Role[]>;
  getPreferences: (userId: string) => Promise<PreferencesRecord | null>;
  updatePreferences: (
    userId: string,
    partial: Partial<PreferencesRecord>,
  ) => Promise<PreferencesRecord>;
  getPrivacySettings: (userId: string) => Promise<PrivacySettingsRecord | null>;
  updatePrivacySettings: (
    userId: string,
    partial: Partial<PrivacySettingsRecord>,
  ) => Promise<PrivacySettingsRecord>;
  updateProfileFields: (
    userId: string,
    fields: { displayName: string | null; biography: string | null },
  ) => Promise<UserRecord>;
  setAvatarKey: (userId: string, key: string | null) => Promise<{ previousKey: string | null }>;
  insertConsents: (
    userId: string,
    consents: { consentType: string; policyVersion: string }[],
    tx?: unknown,
  ) => Promise<void>;
  listConsents: (
    userId: string,
  ) => Promise<
    Array<{ consentType: string; policyVersion: string; grantedAt: Date; revokedAt: Date | null }>
  >;
};

export function createIdentityService(repo: IdentityRepository) {
  return {
    async onUserCreated(userId: string, opts: { locale: string }): Promise<void> {
      await repo.withTransaction(async (tx) => {
        const alreadyOnboarded = await repo.hasPreferences(userId, tx);
        if (alreadyOnboarded) return;

        await repo.insertDefaultPreferences(userId, tx);
        await repo.insertDefaultPrivacySettings(userId, tx);

        const envelope = userRegisteredEvent.create({ userId, locale: opts.locale });
        await repo.writeEvent(envelope, tx);
      });
    },

    async claimUsername(
      userId: string,
      input: { username: string; acceptPolicies: boolean },
    ): Promise<{ id: string; username: string }> {
      if (!input.acceptPolicies) {
        throw new DomainRuleViolationError("validation.consent.required");
      }

      const result = usernameSchema.safeParse(input.username);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.username.format",
        );
      }
      const username = result.data;

      const status = await repo.getOnboardingStatus(userId);
      if (status?.onboardedAt) {
        throw new ConflictError("identity.alreadyOnboarded");
      }

      return repo.withTransaction(async (tx) => {
        const outcome = await repo.setUsername(userId, username, tx);
        if (outcome === "taken") {
          throw new ConflictError("identity.username.taken");
        }

        await repo.insertConsents(
          userId,
          SIGNUP_CONSENT_TYPES.map((consentType) => ({
            consentType,
            policyVersion: POLICY_VERSION,
          })),
          tx,
        );

        return { id: userId, username };
      });
    },

    async isUsernameAvailable(rawUsername: string): Promise<boolean> {
      const result = usernameSchema.safeParse(rawUsername);
      if (!result.success) return false;
      return !(await repo.isUsernameTaken(result.data));
    },

    async getProfileByUsername(viewer: { id: string } | null, username: string) {
      const profile = await repo.findProfileByUsername(username);
      if (!profile) {
        throw new NotFoundError("identity.profile.notFound");
      }

      const actor = viewer ? { id: viewer.id, roles: await repo.getUserRoles(viewer.id) } : null;

      // Phase 6 wiring point: `following` visibility always resolves to
      // false until the follows/user_blocks feature lands.
      const allowed = can(
        viewProfilePolicy,
        actor,
        { ownerId: profile.id, visibility: profile.visibility },
        { ownerFollowsViewer: false },
      );

      if (!allowed) {
        throw new NotFoundError("identity.profile.notFound");
      }

      return {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        biography: profile.biography,
        avatarKey: profile.avatarKey,
        createdAt: profile.createdAt,
        isOwner: viewer?.id === profile.id,
      };
    },

    async getOwnProfile(userId: string) {
      const user = await repo.findUserById(userId);
      if (!user) {
        throw new NotFoundError("identity.profile.notFound");
      }
      return user;
    },

    async updateProfile(
      userId: string,
      input: { displayName: string | null; biography: string | null },
    ) {
      const result = profileUpdateSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.profile.invalid",
        );
      }

      assertCan(manageOwnAccountPolicy, { id: userId, roles: [] }, { ownerId: userId }, undefined);

      return repo.updateProfileFields(userId, result.data);
    },

    async getPreferences(userId: string) {
      const preferences = await repo.getPreferences(userId);
      if (!preferences) {
        throw new NotFoundError("identity.preferences.notFound");
      }
      return preferences;
    },

    async updatePreferences(userId: string, input: Partial<PreferencesRecord>) {
      const result = preferencesUpdateSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.preferences.range",
        );
      }

      assertCan(manageOwnAccountPolicy, { id: userId, roles: [] }, { ownerId: userId }, undefined);

      return repo.updatePreferences(userId, result.data);
    },

    async getPrivacySettings(userId: string) {
      const privacy = await repo.getPrivacySettings(userId);
      if (!privacy) {
        throw new NotFoundError("identity.privacy.notFound");
      }
      return privacy;
    },

    async updatePrivacySettings(userId: string, input: Partial<PrivacySettingsRecord>) {
      const result = privacyUpdateSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.privacy.invalid",
        );
      }

      assertCan(manageOwnAccountPolicy, { id: userId, roles: [] }, { ownerId: userId }, undefined);

      return repo.updatePrivacySettings(userId, result.data);
    },

    async setAvatar(userId: string, key: string) {
      return repo.setAvatarKey(userId, key);
    },

    async clearAvatar(userId: string) {
      return repo.setAvatarKey(userId, null);
    },

    async listConsents(userId: string) {
      return repo.listConsents(userId);
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
