import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DuckDbService } from './duckdb.service';
import { LegacyClientesRepository } from './legacy-clientes.repository';
import { DuckDbAdminController } from './duckdb-admin.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [DuckDbAdminController],
  providers: [DuckDbService, LegacyClientesRepository],
  exports: [DuckDbService, LegacyClientesRepository],
})
export class DuckDbModule {}
