import { z } from "zod";

export const profileUpdateSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "validation.displayName.length")
    .max(50, "validation.displayName.length")
    .nullable(),
  biography: z
    .string()
    .trim()
    .max(500, "validation.biography.length")
    .nullable()
    .transform((value) => (value === "" ? null : value)),
});
