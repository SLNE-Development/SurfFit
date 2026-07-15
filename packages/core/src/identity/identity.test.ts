import { describe, expect, it } from "vitest";
import { ConflictError, DomainRuleViolationError } from "../errors";
import { type IdentityRepository, createIdentityService } from "./service";

function createFakeRepository() {
  const state = {
    preferencesInserted: false,
    privacyInserted: false,
    events: [] as Array<{ type: string; payload: unknown }>,
    onboardedAt: null as Date | null,
    username: null as string | null,
    takenUsernames: new Set<string>(),
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
    async getOnboardingStatus() {
      return { onboardedAt: state.onboardedAt };
    },
    async setUsername(_userId, username) {
      if (state.takenUsernames.has(username)) return "taken";
      state.username = username;
      state.onboardedAt = new Date();
      return "ok";
    },
    async isUsernameTaken(username) {
      return state.takenUsernames.has(username) || state.username === username;
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

describe("identityService.claimUsername", () => {
  it("sets username and onboardedAt on the happy path", async () => {
    const { repo, state } = createFakeRepository();
    const service = createIdentityService(repo);

    const result = await service.claimUsername("user-1", "SurfFan");

    expect(result).toEqual({ id: "user-1", username: "surffan" });
    expect(state.username).toBe("surffan");
    expect(state.onboardedAt).not.toBeNull();
  });

  it("rejects an invalid username with DomainRuleViolationError", async () => {
    const { repo } = createFakeRepository();
    const service = createIdentityService(repo);

    await expect(service.claimUsername("user-1", "ab")).rejects.toBeInstanceOf(
      DomainRuleViolationError,
    );
  });

  it("throws ConflictError with identity.username.taken when the username is taken", async () => {
    const { repo, state } = createFakeRepository();
    state.takenUsernames.add("surffan");
    const service = createIdentityService(repo);

    await expect(service.claimUsername("user-1", "surffan")).rejects.toMatchObject({
      i18nKey: "identity.username.taken",
    });
  });

  it("throws ConflictError with identity.alreadyOnboarded on a second claim", async () => {
    const { repo } = createFakeRepository();
    const service = createIdentityService(repo);

    await service.claimUsername("user-1", "surffan");

    await expect(service.claimUsername("user-1", "otherName")).rejects.toMatchObject({
      i18nKey: "identity.alreadyOnboarded",
    });
  });

  it("ConflictError is thrown as an instance", async () => {
    const { repo } = createFakeRepository();
    const service = createIdentityService(repo);

    await service.claimUsername("user-1", "surffan");

    await expect(service.claimUsername("user-1", "otherName")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
