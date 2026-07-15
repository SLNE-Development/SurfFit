import { userRegisteredEvent } from "./user-registered";

export const eventRegistry = {
  [userRegisteredEvent.type]: userRegisteredEvent,
} as const;

export type EventType = keyof typeof eventRegistry;
