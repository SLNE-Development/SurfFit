import { describe, expect, it } from "vitest";
import { exerciseSubmissionSchema, movementSubmissionSchema } from "./exercise";

describe("movementSubmissionSchema", () => {
  it("rejects a 2 character name", () => {
    const result = movementSubmissionSchema.safeParse({ name: "Ab", difficulty: "beginner" });
    expect(result.success).toBe(false);
  });

  it("rejects a 2001 character description", () => {
    const result = movementSubmissionSchema.safeParse({
      name: "Bench Press",
      description: "a".repeat(2001),
      difficulty: "beginner",
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults for an empty description", () => {
    const result = movementSubmissionSchema.safeParse({
      name: "Bench Press",
      description: "",
      difficulty: "beginner",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBeNull();
  });
});

describe("exerciseSubmissionSchema", () => {
  const base = {
    movementId: "m1",
    equipmentId: "e1",
    difficulty: "beginner" as const,
    primaryMuscleGroupId: "mg1",
  };

  it("rejects a secondary muscle group that duplicates the primary", () => {
    const result = exerciseSubmissionSchema.safeParse({
      ...base,
      secondaryMuscleGroupIds: ["mg1"],
    });
    expect(result.success).toBe(false);
  });

  it("applies defaults (isUnilateral false, empty secondaries)", () => {
    const result = exerciseSubmissionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isUnilateral).toBe(false);
      expect(result.data.secondaryMuscleGroupIds).toEqual([]);
    }
  });
});
