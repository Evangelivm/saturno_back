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

    // 1. Crear carpeta del usuario si no existe
    const userFolderId = await this.getOrCreateUserFolder(userId);

    // 2. Subir archivo desde disco como stream
    const response = await this.drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [userFolderId],
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

  private async getOrCreateUserFolder(userId: string): Promise<string> {
    // 1. Obtener o crear carpeta raíz "Comprobantes Saturno"
    const rootFolderName = 'Comprobantes Saturno';
    let rootFolderId = await this.findFolder(rootFolderName);

    if (!rootFolderId) {
      const rootFolder = await this.drive.files.create({
        requestBody: {
          name: rootFolderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      rootFolderId = rootFolder.data.id;
    }

    // 2. Buscar carpeta del usuario
    const userFolderName = `Usuario_${userId}`;
    const query = `name='${userFolderName}' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`;

    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    // 3. Si no existe, crear carpeta del usuario
    const folder = await this.drive.files.create({
      requestBody: {
        name: userFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      },
      fields: 'id',
    });

    return folder.data.id;
  }

  private async findFolder(folderName: string): Promise<string | null> {
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const response = await this.drive.files.list({
      q: query,
      fields: 'files(id, name)',
    });

    return response.data.files.length > 0 ? response.data.files[0].id : null;
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

  async downloadStream(fileId: string): Promise<Readable> {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    const response = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    return response.data;
  }

  async downloadFileStream(fileId: string): Promise<{ stream: Readable; mimeType: string; name: string }> {
    if (!this.drive) {
      throw new Error('Google Drive no está configurado');
    }

    const metaResponse = await this.drive.files.get({
      fileId,
      fields: 'name, mimeType',
    });

    const contentResponse = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    return {
      stream: contentResponse.data,
      mimeType: metaResponse.data.mimeType || 'application/octet-stream',
      name: metaResponse.data.name || 'archivo',
    };
  }
}
