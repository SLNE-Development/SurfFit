import { type Policy, definePolicy, hasElevatedRole } from "../authz/engine";

export const viewGymPolicy: Policy<{
  ownerUserId: string;
  status: "pending" | "approved" | "rejected";
}> = definePolicy("gyms.viewGym", (actor, resource) => {
  if (resource.status === "approved") return true;
  if (actor?.id === resource.ownerUserId) return true;
  return hasElevatedRole(actor);
});

export const manageGymPolicy: Policy<{ ownerUserId: string }> = definePolicy(
  "gyms.manageGym",
  (actor, resource) => {
    if (actor?.id === resource.ownerUserId) return true;
    return hasElevatedRole(actor);
  },
);
