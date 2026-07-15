import { describe, expect, it } from "vitest";
import { can } from "../authz/engine";
import { viewContentPolicy } from "./policies";
import { type ExercisesRepository, createExercisesService } from "./service";

const MOVEMENT_ID = "m1";
const OWNER_ID = "owner1";
const MODERATOR_ID = "mod1";
const STRANGER_ID = "stranger1";

function makeRepo(overrides: Partial<ExercisesRepository> = {}): ExercisesRepository {
  return {
    async getUserRoles(userId) {
      if (userId === MODERATOR_ID) return ["moderator"];
      return [];
    },
    async listEquipment() {
      return [];
    },
    async listMuscleGroups() {
      return [];
    },
    async listMovements() {
      return [];
    },
    async searchExercises() {
      return [];
    },
    async findMovementDetailBySlug() {
      return null;
    },
    ...overrides,
  };
}

const approvedVariant = {
  id: "v1",
  name: "Bench Press (Barbell)",
  description: null,
  instructions: null,
  equipmentSlug: "barbell",
  equipmentName: "Barbell",
  isUnilateral: false,
  status: "approved" as const,
  ownerUserId: null,
  muscles: [],
};

const approvedMovement = {
  id: MOVEMENT_ID,
  slug: "bench-press",
  name: "Bench Press",
  description: null,
  difficulty: "intermediate" as const,
  status: "approved" as const,
  ownerUserId: null,
  variants: [approvedVariant],
};

const pendingMovement = {
  ...approvedMovement,
  status: "pending" as const,
  ownerUserId: OWNER_ID,
  variants: [
    {
      ...approvedVariant,
      status: "pending" as const,
      ownerUserId: OWNER_ID,
    },
  ],
};

describe("exercises service — getMovementBySlug", () => {
  it("shows an approved movement to an anonymous viewer", async () => {
    const repo = makeRepo({ findMovementDetailBySlug: async () => approvedMovement });
    const service = createExercisesService(repo);

    const result = await service.getMovementBySlug(null, "en", "bench-press");
    expect(result.status).toBe("approved");
    expect(result.isOwner).toBe(false);
  });

  it("hides a pending movement from a stranger", async () => {
    const repo = makeRepo({ findMovementDetailBySlug: async () => pendingMovement });
    const service = createExercisesService(repo);

    await expect(
      service.getMovementBySlug({ id: STRANGER_ID }, "en", "bench-press"),
    ).rejects.toThrow("exercises.movement.notFound");
  });

  it("shows a pending movement to its owner with isOwner true", async () => {
    const repo = makeRepo({ findMovementDetailBySlug: async () => pendingMovement });
    const service = createExercisesService(repo);

    const result = await service.getMovementBySlug({ id: OWNER_ID }, "en", "bench-press");
    expect(result.isOwner).toBe(true);
    expect(result.status).toBe("pending");
  });

  it("shows a pending movement to a moderator", async () => {
    const repo = makeRepo({ findMovementDetailBySlug: async () => pendingMovement });
    const service = createExercisesService(repo);

    const result = await service.getMovementBySlug({ id: MODERATOR_ID }, "en", "bench-press");
    expect(result.status).toBe("pending");
  });

  it("hides a pending variant of an approved movement from a stranger but shows it to its owner", async () => {
    const mixed = {
      ...approvedMovement,
      variants: [
        approvedVariant,
        {
          id: "v2",
          name: "Bench Press (Dumbbell)",
          description: null,
          instructions: null,
          equipmentSlug: "dumbbell",
          equipmentName: "Dumbbell",
          isUnilateral: false,
          status: "pending" as const,
          ownerUserId: OWNER_ID,
          muscles: [],
        },
      ],
    };
    const repo = makeRepo({ findMovementDetailBySlug: async () => mixed });
    const service = createExercisesService(repo);

    const stranger = await service.getMovementBySlug({ id: STRANGER_ID }, "en", "bench-press");
    expect(stranger.variants).toHaveLength(1);

    const owner = await service.getMovementBySlug({ id: OWNER_ID }, "en", "bench-press");
    expect(owner.variants).toHaveLength(2);
  });
});

describe("exercises service — searchExercises", () => {
  it("rejects a query shorter than 2 characters", async () => {
    const repo = makeRepo();
    const service = createExercisesService(repo);

    await expect(service.searchExercises(null, { locale: "en", query: "b" })).rejects.toThrow(
      "validation.search.tooShort",
    );
  });

  it("clamps a limit over 50 down to 50", async () => {
    let capturedLimit: number | undefined;
    const repo = makeRepo({
      searchExercises: async (params) => {
        capturedLimit = params.limit;
        return [];
      },
    });
    const service = createExercisesService(repo);

    await service.searchExercises(null, { locale: "en", query: "bench", limit: 200 });
    expect(capturedLimit).toBe(50);
  });
});

describe("viewContentPolicy", () => {
  const cases: Array<{
    label: string;
    actor: { id: string; roles: string[] } | null;
    status: "draft" | "pending" | "approved" | "rejected";
    ownerUserId: string | null;
    expected: boolean;
  }> = [
    {
      label: "anonymous + approved",
      actor: null,
      status: "approved",
      ownerUserId: null,
      expected: true,
    },
    {
      label: "anonymous + pending",
      actor: null,
      status: "pending",
      ownerUserId: null,
      expected: false,
    },
    {
      label: "owner + pending",
      actor: { id: OWNER_ID, roles: [] },
      status: "pending",
      ownerUserId: OWNER_ID,
      expected: true,
    },
    {
      label: "stranger + pending",
      actor: { id: STRANGER_ID, roles: [] },
      status: "pending",
      ownerUserId: OWNER_ID,
      expected: false,
    },
    {
      label: "moderator + rejected",
      actor: { id: MODERATOR_ID, roles: ["moderator"] },
      status: "rejected",
      ownerUserId: OWNER_ID,
      expected: true,
    },
  ];

  for (const testCase of cases) {
    it(testCase.label, () => {
      const result = can(
        viewContentPolicy,
        testCase.actor as never,
        { ownerUserId: testCase.ownerUserId, status: testCase.status },
        undefined,
      );
      expect(result).toBe(testCase.expected);
    });
  }
});
