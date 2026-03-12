import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [GoogleDriveModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
