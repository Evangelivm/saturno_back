import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SunatTokenService } from './sunat-token.service';
import { PrismaService } from '../database/prisma.service';

interface ValidateComprobanteParams {
  userId: string;
  numRuc: string;
  codComp: string;
  numeroSerie: string;
  numero: number;
  fechaEmision: string;
  monto?: number;
}

@Injectable()
export class SunatService {
  private readonly SUNAT_API_BASE: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenService: SunatTokenService,
    private readonly prisma: PrismaService,
  ) {
    this.SUNAT_API_BASE = this.configService.get('SUNAT_API_BASE_URL') ||
      'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';
  }

  async validateComprobante(params: ValidateComprobanteParams) {
    try {
      // 1. Obtener token válido (cachear si no expiró)
      const token = await this.tokenService.getValidToken(params.userId);

      // 2. Obtener RUC de tu empresa desde .env (requerido por el API de SUNAT)
      const ruc = this.configService.get('RUC');

      if (!ruc) {
        throw new HttpException('RUC no configurado en variables de entorno', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      // 3. Preparar request a SUNAT
      // Según manual SUNAT: El RUC en la URL es el de quien realiza la consulta (tu empresa)
      const url = `${this.SUNAT_API_BASE}/${ruc}/validarcomprobante`;

      // 4. Preparar body con los datos del comprobante a validar
      const body = {
        numRuc: params.numRuc,
        codComp: params.codComp,
        numeroSerie: params.numeroSerie,
        numero: params.numero,
        fechaEmision: params.fechaEmision,
        ...(params.monto && { monto: params.monto }),
      };

      const response = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new HttpException(
          error.response?.data || 'Error al validar comprobante en SUNAT',
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw error;
    }
  }
}
