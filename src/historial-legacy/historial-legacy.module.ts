import { Module } from '@nestjs/common';
import { HistorialLegacyController } from './historial-legacy.controller';
import { HistorialLegacyService } from './historial-legacy.service';

@Module({
  controllers: [HistorialLegacyController],
  providers: [HistorialLegacyService],
})
export class HistorialLegacyModule {}
