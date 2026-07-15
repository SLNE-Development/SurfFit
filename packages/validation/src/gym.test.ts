import { describe, expect, it } from "vitest";
import { gymCreateSchema } from "./gym";

describe("gymCreateSchema", () => {
  it("rejects a 3-letter country code", () => {
    const result = gymCreateSchema.safeParse({
      name: "Iron Paradise",
      city: "Berlin",
      countryCode: "deu",
    });
    expect(result.success).toBe(false);
  });

  it("uppercases a valid 2-letter country code", () => {
    const result = gymCreateSchema.safeParse({
      name: "Iron Paradise",
      city: "Berlin",
      countryCode: "de",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.countryCode).toBe("DE");
  });

  it("rejects a 2-character name", () => {
    const result = gymCreateSchema.safeParse({ name: "Gy", city: "Berlin", countryCode: "de" });
    expect(result.success).toBe(false);
  });
});
