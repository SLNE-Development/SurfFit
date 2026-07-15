import { describe, expect, it } from "vitest";
import { DomainRuleViolationError } from "../errors";
import { slugify } from "./slug";

describe("slugify", () => {
  it('turns "Bench Press" into "bench-press"', () => {
    expect(slugify("Bench Press")).toBe("bench-press");
  });

  it('turns "Überkopfdrücken!!" into "uberkopfdrucken"', () => {
    expect(slugify("Überkopfdrücken!!")).toBe("uberkopfdrucken");
  });

  it('throws for "---"', () => {
    expect(() => slugify("---")).toThrow(DomainRuleViolationError);
  });
});
