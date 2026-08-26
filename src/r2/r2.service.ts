import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

@Injectable()
export class R2Service implements OnModuleInit {
  private readonly logger = new Logger(R2Service.name);
  private client: S3Client;
  private bucket: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const endpoint = this.config.get<string>('R2_ENDPOINT');
    const bucket = this.config.get<string>('R2_BUCKET_NAME');

    if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
      this.logger.warn('⚠️  R2 no está configurado (faltan variables de entorno R2_*). Subida/lectura de R2 no funcionará.');
      return;
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    this.logger.log('✅ Cloudflare R2 client inicializado');
  }

  private ensureReady() {
    if (!this.client) {
      throw new Error('R2 no está configurado. Revisa las variables R2_* en el .env');
    }
  }

  /**
   * Sube un objeto a R2. Usa multipart automático (vía @aws-sdk/lib-storage) para
   * poder pasar un stream sin conocer el tamaño de antemano y sin cargarlo entero
   * en memoria — importante para PDFs/XML grandes migrados desde Drive.
   */
  async uploadObject(
    key: string,
    body: Readable | Buffer,
    contentType?: string,
  ): Promise<{ key: string; etag?: string }> {
    this.ensureReady();

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    });

    const result = await upload.done();
    return { key, etag: result.ETag };
  }

  async getObjectStream(key: string): Promise<{ stream: Readable; contentType?: string; contentLength?: number }> {
    this.ensureReady();

    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      stream: res.Body as Readable,
      contentType: res.ContentType,
      contentLength: res.ContentLength,
    };
  }

  /** Existe + metadata, sin descargar el contenido — útil para verificar migraciones. */
  async headObject(key: string): Promise<{ etag?: string; size?: number } | null> {
    this.ensureReady();

    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { etag: res.ETag, size: res.ContentLength };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return null;
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    this.ensureReady();
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async putObjectSmall(key: string, body: Buffer, contentType?: string): Promise<{ key: string; etag?: string }> {
    this.ensureReady();
    const res = await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return { key, etag: res.ETag };
  }
}
