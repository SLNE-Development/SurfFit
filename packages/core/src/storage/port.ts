export type StorageProvider = {
  ensureBucket(): Promise<void>;
  putObject(key: string, body: Uint8Array, opts: { contentType: string }): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
  deleteObject(key: string): Promise<void>;
  getSignedDownloadUrl(
    key: string,
    opts: { expiresInSeconds: number; downloadFilename?: string },
  ): Promise<string>;
};
