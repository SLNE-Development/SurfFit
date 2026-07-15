import { usernameSchema } from "@surffit/validation";
import { ConflictError, DomainRuleViolationError } from "../errors";
import type { EventEnvelope } from "../events/envelope";
import { userRegisteredEvent } from "../events/user-registered";

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
      rawUsername: string,
    ): Promise<{ id: string; username: string }> {
      const result = usernameSchema.safeParse(rawUsername);
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

      const outcome = await repo.setUsername(userId, username);
      if (outcome === "taken") {
        throw new ConflictError("identity.username.taken");
      }

      return { id: userId, username };
    },

    async isUsernameAvailable(rawUsername: string): Promise<boolean> {
      const result = usernameSchema.safeParse(rawUsername);
      if (!result.success) return false;
      return !(await repo.isUsernameTaken(result.data));
    },
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
