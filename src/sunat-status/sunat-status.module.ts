import { Module } from '@nestjs/common';
import { SunatStatusService } from './sunat-status.service';
import { SunatStatusController } from './sunat-status.controller';

@Module({
  controllers: [SunatStatusController],
  providers: [SunatStatusService],
})
export class SunatStatusModule {}
