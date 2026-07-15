import { z } from "zod";
import { defineEvent } from "./envelope";

export const contentSubjectTypeSchema = z.enum(["movement", "exercise", "gym"]);

export const contentSubmittedPayloadSchema = z.object({
  subjectType: contentSubjectTypeSchema,
  subjectId: z.string(),
  ownerUserId: z.string(),
});

export const contentSubmittedEvent = defineEvent({
  type: "content.submitted",
  version: 1,
  payloadSchema: contentSubmittedPayloadSchema,
});

export const contentModeratedPayloadSchema = z.object({
  subjectType: contentSubjectTypeSchema,
  subjectId: z.string(),
  decision: z.enum(["approved", "rejected"]),
  moderatorUserId: z.string(),
});

export const contentModeratedEvent = defineEvent({
  type: "content.moderated",
  version: 1,
  payloadSchema: contentModeratedPayloadSchema,
});
