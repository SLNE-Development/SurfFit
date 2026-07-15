import type { Env } from "../config/env";
import { createS3Storage } from "./s3";

export type { StorageProvider } from "./port";
export { createS3Storage } from "./s3";

export function createStorageFromEnv(env: Env) {
  return createS3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
  });
}
