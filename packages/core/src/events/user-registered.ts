import { z } from "zod";
import { defineEvent } from "./envelope";

export const userRegisteredPayloadSchema = z.object({
  userId: z.string(),
  locale: z.string(),
});

export const userRegisteredEvent = defineEvent({
  type: "user.registered",
  version: 1,
  payloadSchema: userRegisteredPayloadSchema,
});
