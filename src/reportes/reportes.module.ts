import { Module } from '@nestjs/common';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { R2Module } from '../r2/r2.module';
import { DuckDbModule } from '../duckdb/duckdb.module';

@Module({
  imports: [GoogleDriveModule, R2Module, DuckDbModule],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
