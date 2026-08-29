import { Module } from '@nestjs/common';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { SunatModule } from '../sunat/sunat.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { R2Module } from '../r2/r2.module';

@Module({
  imports: [SunatModule, GoogleDriveModule, R2Module],
  controllers: [ComprobantesController],
  providers: [ComprobantesService],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
