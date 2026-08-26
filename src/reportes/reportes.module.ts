import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { R2Module } from '../r2/r2.module';

@Module({
  imports: [GoogleDriveModule, R2Module],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
