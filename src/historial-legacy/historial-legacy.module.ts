import { Module } from '@nestjs/common';
import { HistorialLegacyController } from './historial-legacy.controller';
import { HistorialLegacyService } from './historial-legacy.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { R2Module } from '../r2/r2.module';

@Module({
  imports: [GoogleDriveModule, R2Module],
  controllers: [HistorialLegacyController],
  providers: [HistorialLegacyService],
})
export class HistorialLegacyModule {}
