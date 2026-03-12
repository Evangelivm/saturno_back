import { Module } from '@nestjs/common';
import { HistorialLegacyController } from './historial-legacy.controller';
import { HistorialLegacyService } from './historial-legacy.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [HistorialLegacyController],
  providers: [HistorialLegacyService],
})
export class HistorialLegacyModule {}
