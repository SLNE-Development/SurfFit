import { runMigrations } from "./migrate";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  await runMigrations(connectionString);
  console.log("Migrations applied successfully");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
