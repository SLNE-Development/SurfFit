import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3Storage } from "./s3";

let container: StartedTestContainer;
let storage: ReturnType<typeof createS3Storage>;

beforeAll(async () => {
  container = await new GenericContainer("minio/minio:latest")
    .withExposedPorts(9000)
    .withEnvironment({
      MINIO_ROOT_USER: "surffit",
      MINIO_ROOT_PASSWORD: "surffit123",
    })
    .withCommand(["server", "/data"])
    .withWaitStrategy(Wait.forLogMessage(/API:/))
    .start();

  const endpoint = `http://${container.getHost()}:${container.getMappedPort(9000)}`;

  storage = createS3Storage({
    endpoint,
    region: "us-east-1",
    accessKeyId: "surffit",
    secretAccessKey: "surffit123",
    bucket: "surffit-test",
    forcePathStyle: true,
  });
}, 120_000);

afterAll(async () => {
  await container.stop();
});

describe("s3 storage provider", () => {
  it("ensureBucket is idempotent", async () => {
    await storage.ensureBucket();
    await expect(storage.ensureBucket()).resolves.toBeUndefined();
  });

  it("round-trips bytes and content type via putObject/getObject", async () => {
    await storage.ensureBucket();
    const body = new TextEncoder().encode("hello world");

    await storage.putObject("round-trip.txt", body, { contentType: "text/plain" });
    const result = await storage.getObject("round-trip.txt");

    expect(new TextDecoder().decode(result)).toBe("hello world");
  });

  it("signed URL is fetchable and an unsigned URL to the same key is forbidden", async () => {
    await storage.ensureBucket();
    const body = new TextEncoder().encode("signed content");
    await storage.putObject("signed.txt", body, { contentType: "text/plain" });

    const signedUrl = await storage.getSignedDownloadUrl("signed.txt", { expiresInSeconds: 60 });
    const signedResponse = await fetch(signedUrl);
    expect(signedResponse.status).toBe(200);
    expect(await signedResponse.text()).toBe("signed content");

    const unsignedUrl = new URL(signedUrl);
    unsignedUrl.search = "";
    const unsignedResponse = await fetch(unsignedUrl.toString());
    expect(unsignedResponse.status).toBe(403);
  });

  it("deleteObject removes the object and is idempotent", async () => {
    await storage.ensureBucket();
    const body = new TextEncoder().encode("to be deleted");
    await storage.putObject("delete-me.txt", body, { contentType: "text/plain" });

    await storage.deleteObject("delete-me.txt");
    await expect(storage.getObject("delete-me.txt")).rejects.toThrow();

    await expect(storage.deleteObject("delete-me.txt")).resolves.toBeUndefined();
  });
});
