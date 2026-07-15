import { type Policy, definePolicy } from "../authz/engine";

const ELEVATED_ROLES = ["moderator", "admin", "super_admin"] as const;

export const viewProfilePolicy: Policy<
  { ownerId: string; visibility: "public" | "following" | "private" },
  { ownerFollowsViewer: boolean }
> = definePolicy("identity.viewProfile", (actor, resource, context) => {
  if (actor?.id === resource.ownerId) {
    return true;
  }
  if (
    actor?.roles.some((role) => ELEVATED_ROLES.includes(role as (typeof ELEVATED_ROLES)[number]))
  ) {
    return true;
  }
  switch (resource.visibility) {
    case "public":
      return true;
    case "following":
      return context.ownerFollowsViewer;
    case "private":
      return false;
  }
});

export const manageOwnAccountPolicy: Policy<{ ownerId: string }> = definePolicy(
  "identity.manageOwnAccount",
  (actor, resource) => actor !== null && actor.id === resource.ownerId,
);
