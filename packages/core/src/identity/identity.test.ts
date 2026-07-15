import { describe, expect, it } from "vitest";
import { type IdentityRepository, createIdentityService } from "./service";

function createFakeRepository() {
  const state = {
    preferencesInserted: false,
    privacyInserted: false,
    events: [] as Array<{ type: string; payload: unknown }>,
  };

  const repo: IdentityRepository = {
    async withTransaction(fn) {
      return fn(undefined);
    },
    async hasPreferences() {
      return state.preferencesInserted;
    },
    async insertDefaultPreferences() {
      state.preferencesInserted = true;
    },
    async insertDefaultPrivacySettings() {
      state.privacyInserted = true;
    },
    async writeEvent(envelope) {
      state.events.push({ type: envelope.type, payload: envelope.payload });
    },
  };

  return { repo, state };
}

describe("identityService.onUserCreated", () => {
  it("creates one preferences row, one privacy row, and one outbox event", async () => {
    const { repo, state } = createFakeRepository();
    const service = createIdentityService(repo);

    await service.onUserCreated("user-1", { locale: "en" });

    expect(state.preferencesInserted).toBe(true);
    expect(state.privacyInserted).toBe(true);
    expect(state.events).toEqual([
      { type: "user.registered", payload: { userId: "user-1", locale: "en" } },
    ]);
  });

  it("is idempotent: calling twice does not double-write the event", async () => {
    const { repo, state } = createFakeRepository();
    const service = createIdentityService(repo);

    await service.onUserCreated("user-1", { locale: "en" });
    await service.onUserCreated("user-1", { locale: "en" });

    expect(state.events).toHaveLength(1);
  });
});
