import { describe, expect, it } from "vitest";
import { userRegisteredEvent } from "./user-registered";

describe("userRegisteredEvent", () => {
  it("creates a valid envelope", () => {
    const envelope = userRegisteredEvent.create({ userId: "u1", locale: "en" });

    expect(envelope.id).toBeTruthy();
    expect(envelope.version).toBe(1);
    expect(envelope.type).toBe("user.registered");
  });

  it("rejects a payload missing userId", () => {
    expect(() =>
      userRegisteredEvent.parse({
        id: "e1",
        type: "user.registered",
        version: 1,
        occurredAt: new Date().toISOString(),
        payload: { locale: "en" },
      }),
    ).toThrow();
  });
});
