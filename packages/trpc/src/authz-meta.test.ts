import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("authz metadata completeness", () => {
  it("every procedure declares authz meta of public or session", () => {
    const procedures = appRouter._def.procedures as unknown as Record<
      string,
      { _def: { meta?: { authz?: string } } }
    >;
    const offending: string[] = [];

    for (const [path, proc] of Object.entries(procedures)) {
      const authz = proc._def.meta?.authz;
      if (authz !== "public" && authz !== "session") {
        offending.push(path);
      }
    }

    expect(offending).toEqual([]);
  });
});
