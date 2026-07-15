import { z } from "zod";

export const gymCreateSchema = z.object({
  name: z.string().trim().min(3, "validation.gym.name").max(80, "validation.gym.name"),
  description: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : (value ?? null))),
  city: z.string().trim().min(1, "validation.gym.city").max(80, "validation.gym.city"),
  countryCode: z
    .string()
    .trim()
    .length(2, "validation.gym.countryCode")
    .regex(/^[A-Za-z]{2}$/, "validation.gym.countryCode")
    .transform((value) => value.toUpperCase()),
  address: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : (value ?? null))),
});

export const gymUpdateSchema = gymCreateSchema.partial();

export const gymEquipmentAddSchema = z.object({
  equipmentId: z.string().min(1),
  label: z
    .string()
    .trim()
    .min(1, "validation.gym.equipmentLabel")
    .max(80, "validation.gym.equipmentLabel"),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : (value ?? null))),
});
