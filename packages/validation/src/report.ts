import { z } from "zod";

export const reportCreateSchema = z.object({
  subjectType: z.enum(["movement", "exercise", "gym", "user"]),
  subjectId: z.string().min(1),
  reason: z.enum(["spam", "inappropriate", "incorrect", "copyright", "other"]),
  details: z
    .string()
    .trim()
    .max(1000, "validation.report.details")
    .optional()
    .transform((value) => (value === "" ? null : (value ?? null))),
});
