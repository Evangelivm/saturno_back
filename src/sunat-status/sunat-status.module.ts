import { Module } from '@nestjs/common';
import { SunatStatusService } from './sunat-status.service';
import { SunatStatusController } from './sunat-status.controller';
import { ComprobantesModule } from '../comprobantes/comprobantes.module';

@Module({
  imports: [ComprobantesModule],
  controllers: [SunatStatusController],
  providers: [SunatStatusService],
})
export class SunatStatusModule {}
