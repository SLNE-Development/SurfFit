async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  console.log("no seed data yet");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
