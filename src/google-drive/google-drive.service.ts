import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { Readable } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GoogleDriveService {
  private drive: any;
  private oauth2Client: any;
  private readonly folderCache = new Map<string, string | null>();

  constructor(private readonly config: ConfigService) {
    this.initializeOAuth();
  }

  private initializeOAuth() {
    try {
      // Leer credenciales OAuth
      const credentialsPath = path.join(process.cwd(), 'secrets', 'google-oauth-credentials.json');
      const tokenPath = path.join(process.cwd(), 'secrets', 'google-oauth-token.json');

      if (!fs.existsSync(credentialsPath)) {
        console.warn('⚠️  Google OAuth credentials not found. Google Drive upload will not work.');
        return;
      }

      if (!fs.existsSync(tokenPath)) {
        console.warn('⚠️  Google OAuth token not found. Run "npm run generate-google-token" first.');
        return;
      }

      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

      const { client_id, client_secret, redirect_uris } = credentials.installed || credentials.web;

      // Crear cliente OAuth
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Establecer credenciales
      this.oauth2Client.setCredentials(token);

      // Refrescar token automáticamente cuando expire
      this.oauth2Client.on('tokens', (tokens: any) => {
        if (tokens.refresh_token) {
          token.refresh_token = tokens.refresh_token;
        }
        token.access_token = tokens.access_token;
        token.expiry_date = tokens.expiry_date;

        // Guardar token actualizado
        fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
      });

      this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      console.log('✅ Google Drive OAuth initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing Google Drive OAuth:', error.message);
    }
  }

  async uploadFile(file: Express.Multer.File, userId: string) {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado. Ejecuta "npm run generate-google-token" primero.');
    }

    // 1. Obtener o crear carpeta facturas_2026
    const folderId = await this.getOrCreateFacturasFolder();

    // 2. Subir archivo desde disco como stream
    const response = await this.drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [folderId],
        mimeType: file.mimetype,
      },
      media: {
        mimeType: file.mimetype,
        body: fs.createReadStream(file.path),
      },
      fields: 'id, name, mimeType, createdTime',
    });

    return response.data;
  }

  private async getOrCreateFacturasFolder(): Promise<string> {
    const folderName = 'facturas_2026';
    let folderId = await this.findFolder(folderName);

    if (!folderId) {
      const folder = await this.drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = folder.data.id;
      console.log(`✅ Carpeta "${folderName}" creada en Google Drive`);
    }

    return folderId!;
  }

  private async findFolder(folderName: string): Promise<string | null> {
    if (this.folderCache.has(folderName)) {
      return this.folderCache.get(folderName) ?? null;
    }

    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await this.withRetry<any>(() =>
      this.drive.files.list({ q: query, fields: 'files(id, name)' }),
    );

    const folderId: string | null = response.data.files.length > 0 ? response.data.files[0].id : null;
    this.folderCache.set(folderName, folderId);
    return folderId;
  }

  async findFileInLegacyFolder(fileName: string, tipo: string): Promise<{ id: string; name: string; mimeType: string } | null> {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    const folderMap: Record<string, string> = {
      factura: 'FACTURAS2024',
      xml:     'XML2024',
      guia:    'GUIAS2024',
      pedido:  'PEDIDOS2024',
    };

    const folderName = folderMap[tipo] ?? 'FACTURAS2024';
    const folderId = await this.findFolder(folderName);
    if (!folderId) return null;

    const response = await this.withRetry<any>(() =>
      this.drive.files.list({
        q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
        fields: 'files(id, name, mimeType)',
      }),
    );

    return response.data.files.length > 0 ? response.data.files[0] : null;
  }

  async getFile(fileId: string) {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    const response = await this.drive.files.get({
      fileId,
      fields: 'id, name, mimeType, webViewLink, webContentLink',
    });

    return response.data;
  }

  async deleteFile(fileId: string) {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    await this.drive.files.delete({
      fileId,
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 4): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (rawErr: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = rawErr as any;
        const status: number | string | undefined = err?.response?.status ?? err?.status ?? err?.code;
        const reason: string = err?.response?.data?.error?.errors?.[0]?.reason ?? '';
        const isRateLimit =
          status === 429 ||
          (status === 403 && (reason.includes('rateLimitExceeded') || reason.includes('userRateLimitExceeded')));
        const isServerError = status === 500 || status === 503;

        if ((isRateLimit || isServerError) && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 32000);
          console.warn(`⏳ Google Drive rate limit, reintentando en ${Math.round(delay)}ms (intento ${attempt + 1}/${maxRetries})`);
          await new Promise((r) => setTimeout(r, delay));
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  }

  async downloadStream(fileId: string): Promise<Readable> {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    const response = await this.withRetry<any>(() =>
      this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' }),
    );

    return response.data;
  }

  async downloadFileStream(fileId: string): Promise<{ stream: Readable; mimeType: string; name: string }> {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    const [metaResponse, contentResponse] = await Promise.all([
      this.withRetry(() => this.drive.files.get({ fileId, fields: 'name, mimeType' })),
      this.withRetry(() => this.drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })),
    ]);

    return {
      stream: (contentResponse as any).data,
      mimeType: (metaResponse as any).data.mimeType || 'application/octet-stream',
      name: (metaResponse as any).data.name || 'archivo',
    };
  }
}
