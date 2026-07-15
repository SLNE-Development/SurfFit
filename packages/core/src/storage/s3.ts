import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "./port";

export function createS3Storage(cfg: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}): StorageProvider {
  const client = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });

  return {
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: cfg.bucket }));
      } catch (err) {
        const name = (err as { name?: string })?.name;
        const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
          ?.httpStatusCode;
        if (name !== "NotFound" && status !== 404) {
          throw err;
        }
        try {
          await client.send(new CreateBucketCommand({ Bucket: cfg.bucket }));
        } catch (createErr) {
          const createName = (createErr as { name?: string })?.name;
          if (createName !== "BucketAlreadyOwnedByYou" && createName !== "BucketAlreadyExists") {
            throw createErr;
          }
        }
      }
    },

    async putObject(key, body, opts) {
      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: body,
          ContentType: opts.contentType,
        }),
      );
    },

    async getObject(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
      const body = result.Body;
      if (!body) {
        throw new Error(`Object ${key} has no body`);
      }
      return body.transformToByteArray();
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },

    async getSignedDownloadUrl(key, opts) {
      const command = new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        ...(opts.downloadFilename
          ? { ResponseContentDisposition: `attachment; filename="${opts.downloadFilename}"` }
          : {}),
      });
      return getSignedUrl(client, command, { expiresIn: opts.expiresInSeconds });
    },
  };
}
