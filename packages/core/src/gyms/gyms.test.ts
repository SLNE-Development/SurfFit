import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, PermissionDeniedError } from "../errors";
import { type GymsRepository, createGymsService } from "./service";

const OWNER_ID = "owner1";
const MODERATOR_ID = "mod1";
const STRANGER_ID = "stranger1";
const GYM_ID = "gym1";

function makeRepo(overrides: Partial<GymsRepository> = {}): GymsRepository {
  return {
    async getUserRoles(userId) {
      if (userId === MODERATOR_ID) return ["moderator"];
      return [];
    },
    async withTransaction(fn) {
      return fn(undefined);
    },
    async insertGym() {
      return { id: GYM_ID };
    },
    async writeEvent() {},
    async findGymById() {
      return null;
    },
    async getGymDetail() {
      return null;
    },
    async searchGyms() {
      return [];
    },
    async updateGym() {},
    async insertGymEquipment() {
      return { id: "eq1" };
    },
    async deleteGymEquipment() {
      return false;
    },
    async insertMember() {},
    async deleteMember() {
      return false;
    },
    async isMember() {
      return false;
    },
    async memberCount() {
      return 0;
    },
    async listMyGyms() {
      return [];
    },
    async equipmentExists() {
      return true;
    },
    ...overrides,
  };
}

const pendingGymDetail = {
  id: GYM_ID,
  name: "Iron Paradise",
  description: null,
  city: "Berlin",
  countryCode: "DE",
  address: null,
  status: "pending" as const,
  ownerUserId: OWNER_ID,
  memberCount: 0,
  equipment: [],
};

describe("gyms service — createGym", () => {
  it("writes a gym + content.submitted envelope", async () => {
    let envelopeCount = 0;
    const repo = makeRepo({
      writeEvent: async () => {
        envelopeCount++;
      },
    });
    const service = createGymsService(repo);

    const result = await service.createGym(OWNER_ID, {
      name: "Iron Paradise",
      city: "Berlin",
      countryCode: "de",
    });

    expect(result).toEqual({ id: GYM_ID, name: "Iron Paradise", status: "pending" });
    expect(envelopeCount).toBe(1);
  });
});

describe("gyms service — getGymById", () => {
  it("hides a pending gym from a stranger", async () => {
    const repo = makeRepo({ getGymDetail: async () => pendingGymDetail });
    const service = createGymsService(repo);

    await expect(service.getGymById({ id: STRANGER_ID }, "en", GYM_ID)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("shows a pending gym to its owner", async () => {
    const repo = makeRepo({ getGymDetail: async () => pendingGymDetail });
    const service = createGymsService(repo);

    const result = await service.getGymById({ id: OWNER_ID }, "en", GYM_ID);
    expect(result.isOwner).toBe(true);
  });

  it("shows a pending gym to a moderator", async () => {
    const repo = makeRepo({ getGymDetail: async () => pendingGymDetail });
    const service = createGymsService(repo);

    const result = await service.getGymById({ id: MODERATOR_ID }, "en", GYM_ID);
    expect(result.status).toBe("pending");
  });
});

describe("gyms service — join/leave", () => {
  it("rejects joining a pending gym", async () => {
    const repo = makeRepo({
      findGymById: async () => ({
        id: GYM_ID,
        ownerUserId: OWNER_ID,
        status: "pending",
        deletedAt: null,
      }),
    });
    const service = createGymsService(repo);

    await expect(service.joinGym(STRANGER_ID, GYM_ID)).rejects.toThrow(NotFoundError);
  });

  it("rejects double joining an approved gym", async () => {
    const repo = makeRepo({
      findGymById: async () => ({
        id: GYM_ID,
        ownerUserId: OWNER_ID,
        status: "approved",
        deletedAt: null,
      }),
      isMember: async () => true,
    });
    const service = createGymsService(repo);

    await expect(service.joinGym(STRANGER_ID, GYM_ID)).rejects.toThrow(ConflictError);
  });

  it("rejects leaving without membership", async () => {
    const repo = makeRepo({ deleteMember: async () => false });
    const service = createGymsService(repo);

    await expect(service.leaveGym(STRANGER_ID, GYM_ID)).rejects.toThrow(NotFoundError);
  });
});

describe("gyms service — updateGym / removeEquipment", () => {
  it("rejects update from a non-owner", async () => {
    const repo = makeRepo({
      findGymById: async () => ({
        id: GYM_ID,
        ownerUserId: OWNER_ID,
        status: "pending",
        deletedAt: null,
      }),
    });
    const service = createGymsService(repo);

    await expect(service.updateGym(STRANGER_ID, GYM_ID, { name: "New Name" })).rejects.toThrow(
      PermissionDeniedError,
    );
  });

  it("allows update from a moderator", async () => {
    const repo = makeRepo({
      findGymById: async () => ({
        id: GYM_ID,
        ownerUserId: OWNER_ID,
        status: "pending",
        deletedAt: null,
      }),
      getGymDetail: async () => pendingGymDetail,
    });
    const service = createGymsService(repo);

    const result = await service.updateGym(MODERATOR_ID, GYM_ID, { name: "New Name" });
    expect(result.id).toBe(GYM_ID);
  });

  it("removeEquipment on a missing row throws gyms.equipment.notFound", async () => {
    const repo = makeRepo({
      findGymById: async () => ({
        id: GYM_ID,
        ownerUserId: OWNER_ID,
        status: "pending",
        deletedAt: null,
      }),
      deleteGymEquipment: async () => false,
    });
    const service = createGymsService(repo);

    await expect(service.removeEquipment(OWNER_ID, GYM_ID, "eq-missing")).rejects.toMatchObject({
      i18nKey: "gyms.equipment.notFound",
    });
  });
});
