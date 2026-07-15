import { describe, expect, it } from "vitest";
import { preferencesUpdateSchema, privacyUpdateSchema } from "./settings";

describe("preferencesUpdateSchema", () => {
  it("rejects an out-of-range firstWeekday", () => {
    const result = preferencesUpdateSchema.safeParse({ firstWeekday: 7 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.preferences.range");
    }
  });

  it("rejects an out-of-range defaultRestSeconds", () => {
    const result = preferencesUpdateSchema.safeParse({ defaultRestSeconds: 5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.preferences.range");
    }
  });

  it("accepts a partial update", () => {
    const result = preferencesUpdateSchema.safeParse({ unitSystem: "imperial" });
    expect(result.success).toBe(true);
  });
});

describe("privacyUpdateSchema", () => {
  it("rejects an invalid profileVisibility enum value", () => {
    const result = privacyUpdateSchema.safeParse({ profileVisibility: "friends" });
    expect(result.success).toBe(false);
  });

  it("accepts a partial update", () => {
    const result = privacyUpdateSchema.safeParse({ showStatistics: false });
    expect(result.success).toBe(true);
  });
});
