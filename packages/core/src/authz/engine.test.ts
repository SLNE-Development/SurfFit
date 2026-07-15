import { describe, expect, it } from "vitest";
import { PermissionDeniedError } from "../errors";
import { assertCan, can, definePolicy } from "./engine";

const alwaysTrue = definePolicy<{ id: string }>("test.alwaysTrue", () => true);
const alwaysFalse = definePolicy<{ id: string }>("test.alwaysFalse", () => false);
const reachesCheck = definePolicy<{ id: string }>("test.reachesCheck", (actor) => actor === null);

describe("can", () => {
  it("returns true when the policy check returns true", () => {
    expect(can(alwaysTrue, { id: "u1", roles: [] }, { id: "r1" }, undefined)).toBe(true);
  });

  it("returns false when the policy check returns false", () => {
    expect(can(alwaysFalse, { id: "u1", roles: [] }, { id: "r1" }, undefined)).toBe(false);
  });

  it("lets an anonymous (null) actor reach the check", () => {
    expect(can(reachesCheck, null, { id: "r1" }, undefined)).toBe(true);
  });
});

describe("assertCan", () => {
  it("does not throw when the policy allows", () => {
    expect(() =>
      assertCan(alwaysTrue, { id: "u1", roles: [] }, { id: "r1" }, undefined),
    ).not.toThrow();
  });

  it("throws PermissionDeniedError with i18nKey authz.denied and params.policy set to the policy name", () => {
    try {
      assertCan(alwaysFalse, { id: "u1", roles: [] }, { id: "r1" }, undefined);
      expect.unreachable("expected assertCan to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      const permErr = err as PermissionDeniedError;
      expect(permErr.i18nKey).toBe("authz.denied");
      expect(permErr.params?.policy).toBe("test.alwaysFalse");
    }
  });
});
