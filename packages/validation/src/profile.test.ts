import { describe, expect, it } from "vitest";
import { profileUpdateSchema } from "./profile";

describe("profileUpdateSchema", () => {
  it("trims displayName and enforces length bounds", () => {
    const trimmed = profileUpdateSchema.safeParse({
      displayName: "  Ada  ",
      biography: null,
    });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) {
      expect(trimmed.data.displayName).toBe("Ada");
    }

    const tooLong = profileUpdateSchema.safeParse({
      displayName: "a".repeat(51),
      biography: null,
    });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.issues[0]?.message).toBe("validation.displayName.length");
    }
  });

  it("rejects a biography over 500 characters", () => {
    const result = profileUpdateSchema.safeParse({
      displayName: null,
      biography: "a".repeat(501),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.biography.length");
    }
  });

  it("transforms an empty biography string to null", () => {
    const result = profileUpdateSchema.safeParse({
      displayName: null,
      biography: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.biography).toBeNull();
    }
  });

  it("allows null to clear both fields", () => {
    const result = profileUpdateSchema.safeParse({ displayName: null, biography: null });
    expect(result.success).toBe(true);
  });
});
