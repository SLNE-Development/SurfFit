import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "migrations");

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}
