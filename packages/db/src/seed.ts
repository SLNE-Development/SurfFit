import { createDb } from "./client";
import { runSeed } from "./seed/run";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const db = createDb(process.env.DATABASE_URL);
  const counts = await runSeed(db);
  console.log("seed complete", counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
