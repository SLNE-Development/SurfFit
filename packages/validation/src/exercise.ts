import { z } from "zod";

export const difficultySchema = z.enum(["beginner", "intermediate", "advanced"]);

export const movementSubmissionSchema = z.object({
  name: z.string().trim().min(3, "validation.movement.name").max(80, "validation.movement.name"),
  description: z
    .string()
    .trim()
    .max(2000, "validation.movement.description")
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : (value ?? null))),
  difficulty: difficultySchema,
});

export const exerciseSubmissionSchema = z
  .object({
    movementId: z.string().min(1),
    equipmentId: z.string().min(1),
    difficulty: difficultySchema,
    isUnilateral: z.boolean().default(false),
    name: z
      .string()
      .trim()
      .min(3, "validation.exercise.name")
      .max(80, "validation.exercise.name")
      .nullable()
      .optional()
      .transform((value) => (value === "" ? null : (value ?? null))),
    description: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((value) => (value === "" ? null : (value ?? null))),
    instructions: z
      .string()
      .trim()
      .max(4000, "validation.exercise.instructions")
      .nullable()
      .optional()
      .transform((value) => (value === "" ? null : (value ?? null))),
    primaryMuscleGroupId: z.string().min(1),
    secondaryMuscleGroupIds: z.array(z.string().min(1)).max(5).default([]),
  })
  .refine((input) => !input.secondaryMuscleGroupIds.includes(input.primaryMuscleGroupId), {
    message: "validation.exercise.muscles.overlap",
    path: ["secondaryMuscleGroupIds"],
  });
