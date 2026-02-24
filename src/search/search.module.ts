import { Global, Module } from '@nestjs/common';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Global()
@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const node = config.get<string>('ELASTICSEARCH_NODE', 'https://localhost:9200');
        const username = config.get<string>('ELASTICSEARCH_USERNAME', 'elastic');
        const password = config.get<string>('ELASTICSEARCH_PASSWORD', '');
        const caFingerprint = config.get<string>('ELASTICSEARCH_CA_FINGERPRINT', '');
        const rejectUnauthorized =
          config.get<string>('ELASTICSEARCH_TLS_VERIFY', 'false') === 'true';

        return {
          node,
          auth: { username, password },
          tls: { rejectUnauthorized },
          // En producción, proporcionar el fingerprint del CA en lugar de
          // deshabilitar la verificación TLS:
          ...(caFingerprint ? { caFingerprint } : {}),
          requestTimeout: 30_000,
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [SearchService],
  controllers: [SearchController],
  // @Global() hace que SearchService esté disponible en todos los módulos
  // sin necesidad de importar SearchModule explícitamente.
  exports: [SearchService],
})
export class SearchModule {}
