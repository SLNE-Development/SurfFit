import { describe, expect, it } from "vitest";
import {
  ConflictError,
  DomainError,
  DomainRuleViolationError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitedError,
} from "./index";

describe("domain errors", () => {
  it.each([
    [NotFoundError, "NOT_FOUND"],
    [PermissionDeniedError, "PERMISSION_DENIED"],
    [ConflictError, "CONFLICT"],
    [RateLimitedError, "RATE_LIMITED"],
    [DomainRuleViolationError, "DOMAIN_RULE_VIOLATION"],
  ] as const)("%s has code %s", (ErrorClass, code) => {
    const params = { foo: "bar" };
    const error = new ErrorClass("some.i18n.key", params);

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe(code);
    expect(error.i18nKey).toBe("some.i18n.key");
    expect(error.params).toBe(params);
  });
});
