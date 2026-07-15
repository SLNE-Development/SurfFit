import { type StorageProvider, createStorageFromEnv, loadEnv } from "@surffit/core";

let storagePromise: Promise<StorageProvider> | undefined;

export function getStorage(): Promise<StorageProvider> {
  if (!storagePromise) {
    storagePromise = (async () => {
      const storage = createStorageFromEnv(loadEnv());
      await storage.ensureBucket();
      return storage;
    })();
  }
  return storagePromise;
}

export async function getAvatarUrl(
  storage: StorageProvider,
  avatarKey: string | null,
): Promise<string | null> {
  if (!avatarKey) return null;
  return storage.getSignedDownloadUrl(avatarKey, { expiresInSeconds: 3600 });
}
