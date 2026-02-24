import { Module } from '@nestjs/common';
import { SunatService } from './sunat.service';
import { SunatTokenService } from './sunat-token.service';

@Module({
  providers: [SunatService, SunatTokenService],
  exports: [SunatService],
})
export class SunatModule {}
