import { type Policy, definePolicy, hasElevatedRole } from "../authz/engine";

export const moderateContentPolicy: Policy<null> = definePolicy(
  "moderation.moderateContent",
  (actor) => actor !== null && hasElevatedRole(actor),
);
