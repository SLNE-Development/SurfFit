import { describe, expect, it } from "vitest";
import { can } from "../authz/engine";
import { ConflictError, NotFoundError } from "../errors";
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
    async withTransaction(fn) {
      return fn(undefined);
    },
    async writeEvent() {},
    async insertMovement() {
      return { id: "new-movement" };
    },
    async insertMovementTranslation() {},
    async insertExercise() {
      return { id: "new-exercise" };
    },
    async insertExerciseTranslation() {},
    async insertExerciseMuscles() {},
    async findMovementForSubmission() {
      return null;
    },
    async equipmentExists() {
      return null;
    },
    async muscleGroupsExist() {
      return true;
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

describe("exercises service — submitMovement", () => {
  it("writes a movement + en translation + one content.submitted envelope in a tx and returns the slug", async () => {
    const writtenEnvelopes: unknown[] = [];
    let insertedTranslation: unknown;
    const repo = makeRepo({
      insertMovement: async () => ({ id: "movement-1" }),
      insertMovementTranslation: async (input) => {
        insertedTranslation = input;
      },
      writeEvent: async (envelope) => {
        writtenEnvelopes.push(envelope);
      },
    });
    const service = createExercisesService(repo);

    const result = await service.submitMovement(OWNER_ID, {
      name: "Bench Press",
      difficulty: "intermediate",
    });

    expect(result).toEqual({ id: "movement-1", slug: "bench-press" });
    expect(insertedTranslation).toMatchObject({ name: "Bench Press", locale: "en" });
    expect(writtenEnvelopes).toHaveLength(1);
  });

  it("retries on a slug collision up to -2 before succeeding", async () => {
    let attempts = 0;
    const repo = makeRepo({
      insertMovement: async (input) => {
        attempts++;
        if (input.slug === "bench-press") {
          const err = new Error("dup") as Error & { code: string };
          err.code = "23505";
          throw err;
        }
        return { id: "movement-2" };
      },
    });
    const service = createExercisesService(repo);

    const result = await service.submitMovement(OWNER_ID, {
      name: "Bench Press",
      difficulty: "intermediate",
    });

    expect(result.slug).toBe("bench-press-2");
    expect(attempts).toBe(2);
  });

  it("throws ConflictError after ten collisions", async () => {
    const repo = makeRepo({
      insertMovement: async () => {
        const err = new Error("dup") as Error & { code: string };
        err.code = "23505";
        throw err;
      },
    });
    const service = createExercisesService(repo);

    await expect(
      service.submitMovement(OWNER_ID, { name: "Bench Press", difficulty: "intermediate" }),
    ).rejects.toThrow(ConflictError);
  });
});

describe("exercises service — submitExercise", () => {
  const approvedMovementForSubmission = {
    id: MOVEMENT_ID,
    slug: "bench-press",
    status: "approved" as const,
    ownerUserId: null,
    deletedAt: null,
    name: "Bench Press",
  };

  it("rejects submitting a variant against a stranger's pending movement", async () => {
    const repo = makeRepo({
      findMovementForSubmission: async () => ({
        ...approvedMovementForSubmission,
        status: "pending",
        ownerUserId: OWNER_ID,
      }),
    });
    const service = createExercisesService(repo);

    await expect(
      service.submitExercise(STRANGER_ID, {
        movementId: MOVEMENT_ID,
        equipmentId: "eq1",
        difficulty: "intermediate",
        primaryMuscleGroupId: "mg1",
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws exercises.variant.exists on a duplicate variant", async () => {
    const repo = makeRepo({
      findMovementForSubmission: async () => approvedMovementForSubmission,
      equipmentExists: async () => ({ id: "eq1", name: "Barbell" }),
      insertExercise: async () => {
        const err = new Error("dup") as Error & { code: string };
        err.code = "23505";
        throw err;
      },
    });
    const service = createExercisesService(repo);

    await expect(
      service.submitExercise(OWNER_ID, {
        movementId: MOVEMENT_ID,
        equipmentId: "eq1",
        difficulty: "intermediate",
        primaryMuscleGroupId: "mg1",
      }),
    ).rejects.toMatchObject({ i18nKey: "exercises.variant.exists" });
  });

  it("generates the default name from movement + equipment en names and includes exactly one primary muscle", async () => {
    let insertedTranslationName: string | undefined;
    let insertedMuscles: { muscleGroupId: string; role: string }[] = [];
    const repo = makeRepo({
      findMovementForSubmission: async () => approvedMovementForSubmission,
      equipmentExists: async () => ({ id: "eq1", name: "Barbell" }),
      insertExercise: async () => ({ id: "exercise-1" }),
      insertExerciseTranslation: async (input) => {
        insertedTranslationName = input.name;
      },
      insertExerciseMuscles: async (rows) => {
        insertedMuscles = rows;
      },
    });
    const service = createExercisesService(repo);

    const result = await service.submitExercise(OWNER_ID, {
      movementId: MOVEMENT_ID,
      equipmentId: "eq1",
      difficulty: "intermediate",
      primaryMuscleGroupId: "mg1",
      secondaryMuscleGroupIds: ["mg2"],
    });

    expect(result).toEqual({ id: "exercise-1", movementSlug: "bench-press" });
    expect(insertedTranslationName).toBe("Bench Press (Barbell)");
    expect(insertedMuscles.filter((m) => m.role === "primary")).toHaveLength(1);
    expect(insertedMuscles).toHaveLength(2);
  });
});
