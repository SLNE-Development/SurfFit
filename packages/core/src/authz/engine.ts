import { PermissionDeniedError } from "../errors";

export type Role = "user" | "moderator" | "admin" | "super_admin";

export type Actor = {
  id: string;
  roles: Role[];
};

export type Policy<TResource, TContext = void> = {
  name: string;
  check(actor: Actor | null, resource: TResource, context: TContext): boolean;
};

export function definePolicy<TResource, TContext = void>(
  name: string,
  check: Policy<TResource, TContext>["check"],
): Policy<TResource, TContext> {
  return { name, check };
}

export function can<TResource, TContext>(
  policy: Policy<TResource, TContext>,
  actor: Actor | null,
  resource: TResource,
  context: TContext,
): boolean {
  return policy.check(actor, resource, context);
}

export function assertCan<TResource, TContext>(
  policy: Policy<TResource, TContext>,
  actor: Actor | null,
  resource: TResource,
  context: TContext,
): void {
  if (!can(policy, actor, resource, context)) {
    throw new PermissionDeniedError("authz.denied", { policy: policy.name });
  }
}
