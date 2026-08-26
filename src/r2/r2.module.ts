import { Module } from '@nestjs/common';
import { R2Service } from './r2.service';
import { LegacyR2IndexService } from './legacy-r2-index.service';

@Module({
  providers: [R2Service, LegacyR2IndexService],
  exports: [R2Service, LegacyR2IndexService],
})
export class R2Module {}
