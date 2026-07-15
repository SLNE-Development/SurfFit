import pino from "pino";
import { loadEnv } from "../config/env";

export function createLogger(scope: string) {
  const env = loadEnv();

  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: ["AUTH_SECRET", "AUTH_DISCORD_SECRET"],
      censor: "[REDACTED]",
    },
    transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
  }).child({ scope });
}
