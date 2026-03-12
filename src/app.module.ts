import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { SunatModule } from './sunat/sunat.module';
import { ComprobantesModule } from './comprobantes/comprobantes.module';
import { SunatCredentialsModule } from './sunat-credentials/sunat-credentials.module';
import { SunatStatusModule } from './sunat-status/sunat-status.module';
import { HistorialLegacyModule } from './historial-legacy/historial-legacy.module';
import { SearchModule } from './search/search.module';
import { ReportesModule } from './reportes/reportes.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    SearchModule,
    AuthModule,
    SunatModule,
    ComprobantesModule,
    SunatCredentialsModule,
    SunatStatusModule,
    HistorialLegacyModule,
    ReportesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
