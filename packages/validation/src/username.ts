import { z } from "zod";

const RESERVED_USERNAMES = new Set([
  "admin",
  "surffit",
  "api",
  "www",
  "support",
  "moderator",
  "root",
  "system",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9_]{3,20}$/, "validation.username.format")
      .refine((value) => !RESERVED_USERNAMES.has(value), "validation.username.reserved"),
  );
