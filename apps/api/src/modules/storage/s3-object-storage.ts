import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { ObjectStorage, type PutObjectInput, type SignedUrlOptions } from './object-storage.js';

/**
 * Adapter S3. Usa dos clientes: uno contra el endpoint interno (red de contenedores) y otro
 * con el endpoint público, solo para firmar URLs que abrirá el navegador.
 */
@Injectable()
export class S3ObjectStorage extends ObjectStorage {
  private readonly logger = new Logger(S3ObjectStorage.name);
  private readonly client: S3Client;
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: AppConfig) {
    super();
    const env = config.env;
    const base = {
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    };
    this.client = new S3Client({ ...base, endpoint: env.S3_ENDPOINT });
    this.signer = new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT });
    this.bucket = env.S3_BUCKET;
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Bucket ${this.bucket} creado`);
        return;
      }
      throw error;
    }
  }

  async putObject({ key, body, contentType, metadata }: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: metadata,
        ServerSideEncryption: undefined,
      }),
    );
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) throw new Error(`Objeto vacío: ${key}`);
    return Buffer.from(await response.Body.transformToByteArray());
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404)
        return false;
      throw error;
    }
  }

  signedDownloadUrl(key: string, options: SignedUrlOptions = {}): Promise<string> {
    const disposition = options.downloadFileName
      ? `${options.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(options.downloadFileName)}`
      : undefined;
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: options.expiresInSeconds ?? this.config.env.SIGNED_URL_TTL_SECONDS },
    );
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
