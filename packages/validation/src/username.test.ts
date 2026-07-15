import { describe, expect, it } from "vitest";
import { usernameSchema } from "./username";

describe("usernameSchema", () => {
  it("accepts a valid username", () => {
    const result = usernameSchema.safeParse("surf_fan99");
    expect(result.success).toBe(true);
  });

  it("normalizes uppercase input to lowercase", () => {
    const result = usernameSchema.safeParse("SurfFan99");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("surffan99");
    }
  });

  it("rejects too-short usernames", () => {
    const result = usernameSchema.safeParse("ab");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.username.format");
    }
  });

  it("rejects illegal characters", () => {
    const result = usernameSchema.safeParse("surf fan!");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.username.format");
    }
  });

  it("rejects reserved names", () => {
    const result = usernameSchema.safeParse("admin");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("validation.username.reserved");
    }
  });
});
