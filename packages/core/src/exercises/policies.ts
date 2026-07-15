import { type Policy, definePolicy, hasElevatedRole } from "../authz/engine";

export const viewContentPolicy: Policy<{
  ownerUserId: string | null;
  status: "draft" | "pending" | "approved" | "rejected";
}> = definePolicy("exercises.viewContent", (actor, resource) => {
  if (resource.status === "approved") return true;
  if (actor?.id === resource.ownerUserId) return true;
  return hasElevatedRole(actor);
});
