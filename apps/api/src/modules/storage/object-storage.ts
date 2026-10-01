/** Puerto de almacenamiento de objetos (S3-compatible). Los archivos nunca van a PostgreSQL. */
export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  downloadFileName?: string;
  inline?: boolean;
  expiresInSeconds?: number;
}

export abstract class ObjectStorage {
  abstract ensureBucket(): Promise<void>;
  abstract putObject(input: PutObjectInput): Promise<void>;
  abstract getObject(key: string): Promise<Buffer>;
  abstract objectExists(key: string): Promise<boolean>;
  abstract signedDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  abstract ping(): Promise<void>;
}
