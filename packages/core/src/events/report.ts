import { z } from "zod";
import { defineEvent } from "./envelope";

export const reportCreatedPayloadSchema = z.object({
  reportId: z.string(),
  subjectType: z.enum(["movement", "exercise", "gym", "user"]),
  subjectId: z.string(),
  reporterUserId: z.string(),
});

export const reportCreatedEvent = defineEvent({
  type: "report.created",
  version: 1,
  payloadSchema: reportCreatedPayloadSchema,
});
