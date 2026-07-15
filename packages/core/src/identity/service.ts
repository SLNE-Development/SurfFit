import type { EventEnvelope } from "../events/envelope";
import { userRegisteredEvent } from "../events/user-registered";

export type IdentityRepository = {
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  hasPreferences: (userId: string, tx: unknown) => Promise<boolean>;
  insertDefaultPreferences: (userId: string, tx: unknown) => Promise<void>;
  insertDefaultPrivacySettings: (userId: string, tx: unknown) => Promise<void>;
  writeEvent: (envelope: EventEnvelope, tx: unknown) => Promise<void>;
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
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
