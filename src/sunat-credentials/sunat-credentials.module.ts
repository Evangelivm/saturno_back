import { Module } from '@nestjs/common';
import { SunatCredentialsController } from './sunat-credentials.controller';
import { SunatCredentialsService } from './sunat-credentials.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [SunatCredentialsController],
  providers: [SunatCredentialsService],
  exports: [SunatCredentialsService],
})
export class SunatCredentialsModule {}
