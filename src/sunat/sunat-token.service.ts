import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { SunatCredential } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class SunatTokenService {
  private readonly TOKEN_URL: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.TOKEN_URL = this.config.get('SUNAT_TOKEN_URL') ||
      'https://api-seguridad.sunat.gob.pe/v1/clientesextranet';
  }

  // Todos los usuarios validan comprobantes con la misma credencial SUNAT
  // compartida (la registrada por el Admin) — no cada uno con la suya propia.
  async getValidToken(): Promise<string> {
    const credential = await this.prisma.sunatCredential.findFirst({
      where: { isActive: true },
    });

    if (!credential) {
      throw new Error('No hay credenciales SUNAT activas configuradas en el sistema');
    }

    // 1. Buscar token en cache que no haya expirado
    const cachedToken = await this.prisma.sunatToken.findFirst({
      where: {
        credentialId: credential.id,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (cachedToken) {
      return cachedToken.accessToken;
    }

    // 2. Si no hay token válido, generar uno nuevo
    return this.generateNewToken(credential);
  }

  private async generateNewToken(credential: SunatCredential): Promise<string> {
    // 1. Request a SUNAT para obtener token
    const url = `${this.TOKEN_URL}/${credential.clientId}/oauth2/token/`;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes',
      client_id: credential.clientId,
      client_secret: credential.clientSecret,
    });

    const response = await axios.post(url, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const { access_token, token_type, expires_in } = response.data;

    // 3. Guardar token en cache
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

    await this.prisma.sunatToken.upsert({
      where: {
        userId_credentialId: {
          userId: credential.userId,
          credentialId: credential.id,
        },
      },
      update: {
        accessToken: access_token,
        tokenType: token_type,
        expiresAt,
      },
      create: {
        userId: credential.userId,
        credentialId: credential.id,
        accessToken: access_token,
        tokenType: token_type,
        expiresAt,
      },
    });

    return access_token;
  }
}
