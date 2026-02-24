import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface SunatStatusResult {
  status: 'up' | 'down';
  checkedAt: string;
}

@Injectable()
export class SunatStatusService implements OnModuleInit, OnModuleDestroy {
  private currentStatus: SunatStatusResult = { status: 'up', checkedAt: new Date().toISOString() };
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly SUNAT_BASE_URL: string;

  constructor(private readonly configService: ConfigService) {
    const apiBase =
      this.configService.get('SUNAT_API_BASE_URL') ||
      'https://api.sunat.gob.pe/v1/contribuyente/contribuyentes';
    this.SUNAT_BASE_URL = new URL(apiBase).origin;
  }

  onModuleInit() {
    this.checkStatus();
    this.intervalId = setInterval(() => this.checkStatus(), 30_000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  getStatus(): SunatStatusResult {
    return this.currentStatus;
  }

  private async checkStatus() {
    try {
      await axios.get(this.SUNAT_BASE_URL, { timeout: 5000 });
      this.currentStatus = { status: 'up', checkedAt: new Date().toISOString() };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // El servidor respondió (incluso con 4xx/5xx) → está arriba
        this.currentStatus = { status: 'up', checkedAt: new Date().toISOString() };
      } else {
        // Timeout o error de red → está caído
        this.currentStatus = { status: 'down', checkedAt: new Date().toISOString() };
      }
    }
  }
}
