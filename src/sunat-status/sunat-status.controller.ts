import { Controller, Get } from '@nestjs/common';
import { SunatStatusService } from './sunat-status.service';

@Controller('api/sunat-status')
export class SunatStatusController {
  constructor(private readonly sunatStatusService: SunatStatusService) {}

  @Get()
  getStatus() {
    return this.sunatStatusService.getStatus();
  }
}
