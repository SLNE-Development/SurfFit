const DEFAULT_TEST_ENV: Record<string, string> = {
  DATABASE_URL: "postgres://surffit:surffit@localhost:5432/surffit",
  RABBITMQ_URL: "amqp://surffit:surffit@localhost:5672",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "test-secret",
  AUTH_URL: "http://localhost:3000",
  AUTH_DISCORD_ID: "test-discord-id",
  AUTH_DISCORD_SECRET: "test-discord-secret",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY: "surffit",
  S3_SECRET_KEY: "surffit123",
  S3_BUCKET: "surffit",
};

for (const [key, value] of Object.entries(DEFAULT_TEST_ENV)) {
  if (process.env[key] === undefined) {
    process.env[key] = value;
  }
}
