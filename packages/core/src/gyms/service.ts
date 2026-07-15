import { gymCreateSchema, gymEquipmentAddSchema, gymUpdateSchema } from "@surffit/validation";
import type { Role } from "../authz/engine";
import { assertCan, can } from "../authz/engine";
import { ConflictError, DomainRuleViolationError, NotFoundError } from "../errors";
import { contentSubmittedEvent } from "../events/content";
import type { EventEnvelope } from "../events/envelope";
import { manageGymPolicy, viewGymPolicy } from "./policies";

export type GymStatus = "pending" | "approved" | "rejected";

export type GymEquipmentItem = {
  id: string;
  label: string;
  notes: string | null;
  equipmentSlug: string;
  equipmentName: string;
};

export type GymDetail = {
  id: string;
  name: string;
  description: string | null;
  city: string;
  countryCode: string;
  address: string | null;
  status: GymStatus;
  ownerUserId: string;
  memberCount: number;
  equipment: GymEquipmentItem[];
};

export type GymSearchRow = {
  id: string;
  name: string;
  city: string;
  countryCode: string;
  status: GymStatus;
  ownerUserId: string;
  memberCount: number;
};

export type GymsRepository = {
  getUserRoles: (userId: string) => Promise<Role[]>;
  withTransaction: <T>(fn: (tx: unknown) => Promise<T>) => Promise<T>;
  insertGym: (
    input: {
      name: string;
      description: string | null;
      city: string;
      countryCode: string;
      address: string | null;
      ownerUserId: string;
    },
    tx: unknown,
  ) => Promise<{ id: string }>;
  writeEvent: (envelope: EventEnvelope, tx: unknown) => Promise<void>;
  findGymById: (gymId: string) => Promise<{
    id: string;
    ownerUserId: string;
    status: GymStatus;
    deletedAt: Date | null;
  } | null>;
  getGymDetail: (gymId: string, locale: string) => Promise<GymDetail | null>;
  searchGyms: (params: {
    query?: string;
    viewerId: string | null;
    limit: number;
  }) => Promise<GymSearchRow[]>;
  updateGym: (
    gymId: string,
    partial: Partial<{
      name: string;
      description: string | null;
      city: string;
      countryCode: string;
      address: string | null;
    }>,
  ) => Promise<void>;
  insertGymEquipment: (input: {
    gymId: string;
    equipmentId: string;
    label: string;
    notes: string | null;
  }) => Promise<{ id: string }>;
  deleteGymEquipment: (gymId: string, gymEquipmentId: string) => Promise<boolean>;
  insertMember: (gymId: string, userId: string) => Promise<void>;
  deleteMember: (gymId: string, userId: string) => Promise<boolean>;
  isMember: (gymId: string, userId: string) => Promise<boolean>;
  memberCount: (gymId: string) => Promise<number>;
  listMyGyms: (userId: string) => Promise<GymSearchRow[]>;
  equipmentExists: (equipmentId: string) => Promise<boolean>;
};

export function createGymsService(repo: GymsRepository) {
  async function buildActor(viewer: { id: string } | null) {
    if (!viewer) return null;
    return { id: viewer.id, roles: await repo.getUserRoles(viewer.id) };
  }

  return {
    async createGym(userId: string, input: unknown) {
      const result = gymCreateSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.gym.name",
        );
      }

      return repo.withTransaction(async (tx) => {
        const gym = await repo.insertGym({ ...result.data, ownerUserId: userId }, tx);
        const envelope = contentSubmittedEvent.create({
          subjectType: "gym",
          subjectId: gym.id,
          ownerUserId: userId,
        });
        await repo.writeEvent(envelope, tx);
        return { id: gym.id, name: result.data.name, status: "pending" as const };
      });
    },

    async getGymById(viewer: { id: string } | null, locale: string, gymId: string) {
      const gym = await repo.getGymDetail(gymId, locale);
      if (!gym) {
        throw new NotFoundError("gyms.notFound");
      }

      const actor = await buildActor(viewer);
      const allowed = can(
        viewGymPolicy,
        actor,
        { ownerUserId: gym.ownerUserId, status: gym.status },
        undefined,
      );
      if (!allowed) {
        throw new NotFoundError("gyms.notFound");
      }

      const isMember = viewer ? await repo.isMember(gymId, viewer.id) : false;

      return {
        ...gym,
        isOwner: viewer?.id === gym.ownerUserId,
        isMember,
      };
    },

    async searchGyms(viewer: { id: string } | null, params: { query?: string; limit?: number }) {
      const limit = Math.min(params.limit ?? 20, 50);
      let query: string | undefined;
      if (params.query !== undefined) {
        const trimmed = params.query.trim();
        if (trimmed.length < 2) {
          throw new DomainRuleViolationError("validation.search.tooShort");
        }
        query = trimmed;
      }

      const rows = await repo.searchGyms({ query, viewerId: viewer?.id ?? null, limit });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        countryCode: row.countryCode,
        status: row.status,
        memberCount: row.memberCount,
        isOwner: viewer?.id === row.ownerUserId,
      }));
    },

    async updateGym(userId: string, gymId: string, input: unknown) {
      const result = gymUpdateSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.gym.name",
        );
      }

      const gym = await repo.findGymById(gymId);
      if (!gym || gym.deletedAt) {
        throw new NotFoundError("gyms.notFound");
      }

      const actor = await buildActor({ id: userId });
      assertCan(manageGymPolicy, actor, { ownerUserId: gym.ownerUserId }, undefined);

      await repo.updateGym(gymId, result.data);

      const detail = await repo.getGymDetail(gymId, "en");
      if (!detail) throw new NotFoundError("gyms.notFound");
      return { ...detail, isOwner: userId === detail.ownerUserId };
    },

    async addEquipment(userId: string, gymId: string, input: unknown) {
      const result = gymEquipmentAddSchema.safeParse(input);
      if (!result.success) {
        throw new DomainRuleViolationError(
          result.error.issues[0]?.message ?? "validation.gym.equipmentLabel",
        );
      }

      const gym = await repo.findGymById(gymId);
      if (!gym || gym.deletedAt) {
        throw new NotFoundError("gyms.notFound");
      }

      const actor = await buildActor({ id: userId });
      assertCan(manageGymPolicy, actor, { ownerUserId: gym.ownerUserId }, undefined);

      const equipmentOk = await repo.equipmentExists(result.data.equipmentId);
      if (!equipmentOk) {
        throw new NotFoundError("exercises.equipment.notFound");
      }

      return repo.insertGymEquipment({ gymId, ...result.data });
    },

    async removeEquipment(userId: string, gymId: string, gymEquipmentId: string) {
      const gym = await repo.findGymById(gymId);
      if (!gym || gym.deletedAt) {
        throw new NotFoundError("gyms.notFound");
      }

      const actor = await buildActor({ id: userId });
      assertCan(manageGymPolicy, actor, { ownerUserId: gym.ownerUserId }, undefined);

      const deleted = await repo.deleteGymEquipment(gymId, gymEquipmentId);
      if (!deleted) {
        throw new NotFoundError("gyms.equipment.notFound");
      }
    },

    async joinGym(userId: string, gymId: string) {
      const gym = await repo.findGymById(gymId);
      if (!gym || gym.deletedAt || gym.status !== "approved") {
        throw new NotFoundError("gyms.notFound");
      }

      const alreadyMember = await repo.isMember(gymId, userId);
      if (alreadyMember) {
        throw new ConflictError("gyms.alreadyMember");
      }

      await repo.insertMember(gymId, userId);
    },

    async leaveGym(userId: string, gymId: string) {
      const deleted = await repo.deleteMember(gymId, userId);
      if (!deleted) {
        throw new NotFoundError("gyms.membership.notFound");
      }
    },

    async listMyGyms(userId: string) {
      const rows = await repo.listMyGyms(userId);
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        city: row.city,
        countryCode: row.countryCode,
        status: row.status,
        isOwner: userId === row.ownerUserId,
        memberCount: row.memberCount,
      }));
    },
  };
}

export type GymsService = ReturnType<typeof createGymsService>;
