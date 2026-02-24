# Elasticsearch – Saturno

Stack: **Elasticsearch 8.x + Kibana** con TLS y autenticación habilitados.

---

## Requisitos

| Requisito | Versión mínima |
|-----------|---------------|
| Docker    | 24+           |
| Docker Compose | v2       |
| RAM disponible | 4 GB    |

---

## Primer arranque

```bash
# 1. Crear el .env con tus credenciales
cp .env.example .env
# Editar ELASTIC_PASSWORD, KIBANA_PASSWORD y KIBANA_ENCRYPTION_KEY

# 2. Aumentar el límite de memoria virtual (Linux/WSL2)
#    En Windows con WSL2, ejecutar en PowerShell como administrador:
#    wsl -d docker-desktop sh -c "sysctl -w vm.max_map_count=262144"
#    En Linux directamente:
sudo sysctl -w vm.max_map_count=262144
# Para que sea permanente: echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf

# 3. Crear la red externa de Docker (solo la primera vez)
docker network create saturno_network

# 4. Levantar el stack
docker compose up -d

# 5. Esperar ~60 segundos y verificar
curl -s --cacert <(docker compose exec elasticsearch cat config/certs/ca/ca.crt) \
  -u elastic:TU_PASSWORD https://localhost:9200/_cluster/health | jq .
```

---

## Obtener el CA fingerprint (para el backend NestJS)

El cliente `@elastic/elasticsearch` en modo TLS necesita el fingerprint del CA:

```bash
docker compose exec elasticsearch \
  bin/elasticsearch-certutil fingerprint --ca config/certs/ca/ca.crt \
  --json | jq -r '.certificate_fingerprints[0]'
```

Copia el resultado en `ELASTICSEARCH_CA_FINGERPRINT` del `.env` del backend.

---

## Accesos

| Servicio       | URL                    | Usuario   |
|----------------|------------------------|-----------|
| Elasticsearch  | https://localhost:9200 | elastic   |
| Kibana         | http://localhost:5601  | elastic   |

---

## Comandos útiles

```bash
# Ver logs en tiempo real
docker compose logs -f elasticsearch

# Ver estado del cluster
docker compose exec elasticsearch \
  curl -s --cacert config/certs/ca/ca.crt \
  -u elastic:TU_PASSWORD https://localhost:9200/_cluster/health?pretty

# Detener sin borrar datos
docker compose stop

# Detener y borrar TODO (incluye datos indexados)
docker compose down -v

# Ver índices existentes
docker compose exec elasticsearch \
  curl -s --cacert config/certs/ca/ca.crt \
  -u elastic:TU_PASSWORD https://localhost:9200/_cat/indices?v
```

---

## Integración con NestJS

Instalar el cliente oficial:

```bash
npm install @elastic/elasticsearch
```

Módulo de ejemplo (`elasticsearch.module.ts`):

```typescript
import { Module, Global } from '@nestjs/common';
import { ElasticsearchModule } from '@nestjs/elasticsearch';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    ElasticsearchModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        node: config.get('ELASTICSEARCH_NODE'),
        auth: {
          username: config.get('ELASTICSEARCH_USERNAME'),
          password: config.get('ELASTICSEARCH_PASSWORD'),
        },
        tls: {
          ca: config.get('ELASTICSEARCH_CA_CERT'),   // contenido del ca.crt
          rejectUnauthorized: true,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [ElasticsearchModule],
})
export class ElasticModule {}
```

---

## Consideraciones para 1M+ registros

| Parámetro         | Recomendación                                      |
|-------------------|----------------------------------------------------|
| `ES_HEAP_SIZE`    | `4g` si el servidor tiene 8 GB RAM, `8g` si 16 GB |
| Shards por índice | 1 primario para colecciones < 5M docs              |
| Réplicas          | 1 réplica cuando se agregue un segundo nodo        |
| Refresh interval  | `30s` durante indexación masiva, `1s` en producción|
| Bulk indexing     | Lotes de 500–1000 documentos por request           |

Para pasar de single-node a cluster, agregar nodos adicionales al `docker-compose.yml`
con `discovery.seed_hosts` y `cluster.initial_master_nodes`.
