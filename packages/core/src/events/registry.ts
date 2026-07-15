import { contentModeratedEvent, contentSubmittedEvent } from "./content";
import { gdprExportRequestedEvent, gdprSweepEvent } from "./gdpr";
import { reportCreatedEvent } from "./report";
import { userDeletedEvent } from "./user-deleted";
import { userRegisteredEvent } from "./user-registered";

export const eventRegistry = {
  [userRegisteredEvent.type]: userRegisteredEvent,
  [gdprExportRequestedEvent.type]: gdprExportRequestedEvent,
  [gdprSweepEvent.type]: gdprSweepEvent,
  [userDeletedEvent.type]: userDeletedEvent,
  [contentSubmittedEvent.type]: contentSubmittedEvent,
  [contentModeratedEvent.type]: contentModeratedEvent,
  [reportCreatedEvent.type]: reportCreatedEvent,
} as const;

export type EventType = keyof typeof eventRegistry;
