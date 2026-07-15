import { gdprExportRequestedEvent, gdprSweepEvent } from "./gdpr";
import { userDeletedEvent } from "./user-deleted";
import { userRegisteredEvent } from "./user-registered";

export const eventRegistry = {
  [userRegisteredEvent.type]: userRegisteredEvent,
  [gdprExportRequestedEvent.type]: gdprExportRequestedEvent,
  [gdprSweepEvent.type]: gdprSweepEvent,
  [userDeletedEvent.type]: userDeletedEvent,
} as const;

export type EventType = keyof typeof eventRegistry;
