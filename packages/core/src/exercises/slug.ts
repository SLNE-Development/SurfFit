import { DomainRuleViolationError } from "../errors";

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new DomainRuleViolationError("validation.movement.name");
  }

  return slug;
}
