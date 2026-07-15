import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: [/^@surffit\//],
  // tsup's automatic externalization only reads the entry package's own
  // package.json — deps pulled in transitively through @surffit/* workspace
  // packages (pino, drizzle-orm, etc.) aren't detected, so esbuild bundles
  // them and pino's dynamic requires break under ESM. List them explicitly.
  external: ["pino", "pino-pretty", "amqplib", "drizzle-orm", "pg", "zod", "uuidv7"],
});
