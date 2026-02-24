import { Module } from '@nestjs/common';
import { ComprobantesController } from './comprobantes.controller';
import { ComprobantesService } from './comprobantes.service';
import { SunatModule } from '../sunat/sunat.module';
import { GoogleDriveModule } from '../google-drive/google-drive.module';

@Module({
  imports: [SunatModule, GoogleDriveModule],
  controllers: [ComprobantesController],
  providers: [ComprobantesService],
  exports: [ComprobantesService],
})
export class ComprobantesModule {}
