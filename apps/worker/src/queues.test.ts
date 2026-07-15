import { describe, expect, it } from "vitest";
import { parseWorkerQueues } from "./queues";

const KNOWN = ["system", "billing"];

describe("parseWorkerQueues", () => {
  it("returns all known groups when raw is undefined", () => {
    expect(parseWorkerQueues(undefined, KNOWN)).toEqual(KNOWN);
  });

  it("returns all known groups when raw is empty", () => {
    expect(parseWorkerQueues("", KNOWN)).toEqual(KNOWN);
  });

  it("parses a comma-separated list, tolerating whitespace", () => {
    expect(parseWorkerQueues(" system , billing ", KNOWN)).toEqual(["system", "billing"]);
  });

  it("throws listing valid names when an unknown name is given", () => {
    expect(() => parseWorkerQueues("system,bogus", KNOWN)).toThrow(/system, billing/);
  });
});
