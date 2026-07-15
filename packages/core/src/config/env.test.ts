import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEnv, resetEnvCache } from "./env";

const REQUIRED_ENV = {
  DATABASE_URL: "postgres://surffit:surffit@localhost:5432/surffit",
  RABBITMQ_URL: "amqp://surffit:surffit@localhost:5672",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "test-secret",
  AUTH_URL: "http://localhost:3000",
  AUTH_DISCORD_ID: "test-discord-id",
  AUTH_DISCORD_SECRET: "test-discord-secret",
};

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  resetEnvCache();
});

afterEach(() => {
  process.env = originalEnv;
  resetEnvCache();
});

describe("loadEnv", () => {
  it("parses and caches a valid env", () => {
    Object.assign(process.env, REQUIRED_ENV);

    const first = loadEnv();
    const second = loadEnv();

    expect(first.DATABASE_URL).toBe(REQUIRED_ENV.DATABASE_URL);
    expect(first).toBe(second);
  });

  it("throws an error whose message contains the missing var name", () => {
    Object.assign(process.env, REQUIRED_ENV);
    process.env.DATABASE_URL = undefined;

    expect(() => loadEnv()).toThrow(/DATABASE_URL/);
  });

  it("defaults LOG_LEVEL to info", () => {
    Object.assign(process.env, REQUIRED_ENV);
    process.env.LOG_LEVEL = undefined;

    const env = loadEnv();

    expect(env.LOG_LEVEL).toBe("info");
  });
});
