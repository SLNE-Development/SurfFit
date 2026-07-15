import { describe, expect, it } from "vitest";
import type { Role } from "../authz/engine";
import { ConflictError, DomainRuleViolationError, NotFoundError } from "../errors";
import { type IdentityRepository, createIdentityService } from "./service";

type FakeUser = {
  id: string;
  username: string | null;
  displayName: string | null;
  biography: string | null;
  avatarKey: string | null;
  email: string;
  roles: Role[];
  preferences: {
    unitSystem: "metric" | "imperial";
    theme: "dark" | "light" | "system";
    firstWeekday: number;
    defaultRestSeconds: number;
  };
  privacy: {
    profileVisibility: "public" | "following" | "private";
    showStatistics: boolean;
    showAchievements: boolean;
    showWorkouts: boolean;
    showBodyMetrics: boolean;
  };
};

function makeUser(overrides: Partial<FakeUser> & { id: string }): FakeUser {
  return {
    username: null,
    displayName: null,
    biography: null,
    avatarKey: null,
    email: `${overrides.id}@example.com`,
    roles: [],
    preferences: {
      unitSystem: "metric",
      theme: "dark",
      firstWeekday: 1,
      defaultRestSeconds: 120,
    },
    privacy: {
      profileVisibility: "public",
      showStatistics: true,
      showAchievements: true,
      showWorkouts: true,
      showBodyMetrics: false,
    },
    ...overrides,
  };
}

function createFakeRepository(seedUsers: FakeUser[] = []) {
  const state = {
    preferencesInserted: false,
    privacyInserted: false,
    events: [] as Array<{ type: string; payload: unknown }>,
    onboardedAt: null as Date | null,
    username: null as string | null,
    takenUsernames: new Set<string>(),
    users: new Map(seedUsers.map((u) => [u.id, u])),
  };

  function findByUsername(username: string): FakeUser | undefined {
    return [...state.users.values()].find(
      (u) => u.username?.toLowerCase() === username.toLowerCase(),
    );
  }

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
    async findProfileByUsername(username) {
      const user = findByUsername(username);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        biography: user.biography,
        avatarKey: user.avatarKey,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        visibility: user.privacy.profileVisibility,
      };
    },
    async findUserById(userId) {
      const user = state.users.get(userId);
      if (!user) return null;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        biography: user.biography,
        avatarKey: user.avatarKey,
        email: user.email,
      };
    },
    async getUserRoles(userId) {
      return state.users.get(userId)?.roles ?? [];
    },
    async getPreferences(userId) {
      const user = state.users.get(userId);
      return user ? { ...user.preferences } : null;
    },
    async updatePreferences(userId, partial) {
      const user = state.users.get(userId);
      if (!user) throw new Error("not found");
      Object.assign(user.preferences, partial);
      return { ...user.preferences };
    },
    async getPrivacySettings(userId) {
      const user = state.users.get(userId);
      return user ? { ...user.privacy } : null;
    },
    async updatePrivacySettings(userId, partial) {
      const user = state.users.get(userId);
      if (!user) throw new Error("not found");
      Object.assign(user.privacy, partial);
      return { ...user.privacy };
    },
    async updateProfileFields(userId, fields) {
      const user = state.users.get(userId);
      if (!user) throw new Error("not found");
      user.displayName = fields.displayName;
      user.biography = fields.biography;
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        biography: user.biography,
        avatarKey: user.avatarKey,
        email: user.email,
      };
    },
    async setAvatarKey(userId, key) {
      const user = state.users.get(userId);
      if (!user) throw new Error("not found");
      const previousKey = user.avatarKey;
      user.avatarKey = key;
      return { previousKey };
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

describe("identityService.getProfileByUsername", () => {
  it("is visible to an anonymous viewer when public", async () => {
    const owner = makeUser({ id: "owner-1", username: "surffan", displayName: "Surf Fan" });
    const { repo } = createFakeRepository([owner]);
    const service = createIdentityService(repo);

    const profile = await service.getProfileByUsername(null, "surffan");

    expect(profile.username).toBe("surffan");
    expect(profile.isOwner).toBe(false);
  });

  it("throws NotFoundError for a stranger viewing a private profile, but returns full payload with isOwner true for the owner", async () => {
    const owner = makeUser({
      id: "owner-1",
      username: "privatefan",
      privacy: {
        profileVisibility: "private",
        showStatistics: true,
        showAchievements: true,
        showWorkouts: true,
        showBodyMetrics: false,
      },
    });
    const stranger = makeUser({ id: "stranger-1", username: "stranger" });
    const { repo } = createFakeRepository([owner, stranger]);
    const service = createIdentityService(repo);

    await expect(
      service.getProfileByUsername({ id: "stranger-1" }, "privatefan"),
    ).rejects.toBeInstanceOf(NotFoundError);

    const ownProfile = await service.getProfileByUsername({ id: "owner-1" }, "privatefan");
    expect(ownProfile.isOwner).toBe(true);
  });

  it("moderator sees a private profile", async () => {
    const owner = makeUser({
      id: "owner-1",
      username: "privatefan",
      privacy: {
        profileVisibility: "private",
        showStatistics: true,
        showAchievements: true,
        showWorkouts: true,
        showBodyMetrics: false,
      },
    });
    const mod = makeUser({ id: "mod-1", username: "mod", roles: ["moderator"] });
    const { repo } = createFakeRepository([owner, mod]);
    const service = createIdentityService(repo);

    const profile = await service.getProfileByUsername({ id: "mod-1" }, "privatefan");
    expect(profile.username).toBe("privatefan");
  });

  it("hides a following-visibility profile from a stranger (hard-coded false wiring point)", async () => {
    const owner = makeUser({
      id: "owner-1",
      username: "followfan",
      privacy: {
        profileVisibility: "following",
        showStatistics: true,
        showAchievements: true,
        showWorkouts: true,
        showBodyMetrics: false,
      },
    });
    const stranger = makeUser({ id: "stranger-1", username: "stranger" });
    const { repo } = createFakeRepository([owner, stranger]);
    const service = createIdentityService(repo);

    await expect(
      service.getProfileByUsername({ id: "stranger-1" }, "followfan"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFoundError for an unknown username", async () => {
    const { repo } = createFakeRepository([]);
    const service = createIdentityService(repo);

    await expect(service.getProfileByUsername(null, "nobody")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("identityService.updateProfile", () => {
  it("persists new values and clears fields with null", async () => {
    const owner = makeUser({ id: "owner-1", displayName: "Old Name", biography: "Old bio" });
    const { repo, state } = createFakeRepository([owner]);
    const service = createIdentityService(repo);

    await service.updateProfile("owner-1", { displayName: "New Name", biography: null });

    const stored = state.users.get("owner-1");
    expect(stored?.displayName).toBe("New Name");
    expect(stored?.biography).toBeNull();
  });
});

describe("identityService.updatePreferences", () => {
  it("partially updates, leaving other fields untouched", async () => {
    const owner = makeUser({ id: "owner-1" });
    const { repo, state } = createFakeRepository([owner]);
    const service = createIdentityService(repo);

    await service.updatePreferences("owner-1", { unitSystem: "imperial" });

    const stored = state.users.get("owner-1");
    expect(stored?.preferences.unitSystem).toBe("imperial");
    expect(stored?.preferences.theme).toBe("dark");
  });
});

describe("identityService.setAvatar", () => {
  it("returns the previous key", async () => {
    const owner = makeUser({ id: "owner-1", avatarKey: "avatars/owner-1/old.webp" });
    const { repo } = createFakeRepository([owner]);
    const service = createIdentityService(repo);

    const result = await service.setAvatar("owner-1", "avatars/owner-1/new.webp");

    expect(result.previousKey).toBe("avatars/owner-1/old.webp");
  });
});
