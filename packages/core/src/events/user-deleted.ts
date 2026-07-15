import { z } from "zod";
import { defineEvent } from "./envelope";

export const userDeletedPayloadSchema = z.object({
  userId: z.string(),
});

export const userDeletedEvent = defineEvent({
  type: "user.deleted",
  version: 1,
  payloadSchema: userDeletedPayloadSchema,
});
