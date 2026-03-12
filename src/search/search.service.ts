import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { ConfigService } from '@nestjs/config';
import {
  ComprobanteDocument,
  LegacyDocument,
  SearchOptions,
  SearchResult,
} from './interfaces/search-documents.interface';
import { COMPROBANTES_MAPPING } from './mappings/comprobantes.mapping';
import { LEGACY_MAPPING } from './mappings/legacy.mapping';

export const COMPROBANTES_INDEX = 'saturno_comprobantes';
export const LEGACY_INDEX = 'saturno_comprobantes_legacy';

// ─────────────────────────────────────────────────────────────────────────────
// Query builder
// ─────────────────────────────────────────────────────────────────────────────
function buildSearchQuery(search: string): any {
  const term = search.toLowerCase().trim();

  return {
    bool: {
      should: [
        // RUC  →  coincidencia exacta o por prefijo (boost máximo)
        { term:   { numRuc:             { value: term, boost: 5 } } },
        { prefix: { numRuc:             { value: term, boost: 3 } } },
        // Código alfanumérico
        { term:   { codigoAlfanumerico: { value: term, boost: 4 } } },
        { prefix: { codigoAlfanumerico: { value: term, boost: 2 } } },
        // Serie
        { term:   { numeroSerie:        { value: term, boost: 3 } } },
        { prefix: { numeroSerie:        { value: term, boost: 2 } } },
        // Número (valor original, sin normalizar)
        { term:   { numero:             { value: search, boost: 3 } } },
        { prefix: { numero:             { value: search, boost: 1 } } },
        // Nombre empresa (texto libre)
        { match:  { nombre_empresa:     { query: search, boost: 2 } } },
        // Orden de compra
        { term:   { numero_orden_compra:{ value: search, boost: 2 } } },
        { prefix: { numero_orden_compra:{ value: search, boost: 1 } } },
      ],
      minimum_should_match: 1,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private esAvailable = false;

  constructor(
    private readonly esService: ElasticsearchService,
    private readonly configService: ConfigService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  async onModuleInit(): Promise<void> {
    await this.checkConnection();
    if (this.esAvailable) {
      await this.ensureIndices();
    }
  }

  private async checkConnection(): Promise<void> {
    try {
      await this.esService.ping();
      this.esAvailable = true;
      this.logger.log('✅ Elasticsearch conectado');
    } catch {
      this.esAvailable = false;
      this.logger.warn('⚠️  Elasticsearch no disponible – usando SQL para búsquedas');
    }
  }

  get isAvailable(): boolean {
    return this.esAvailable;
  }

  // ── Gestión de índices ────────────────────────────────────────────────────
  async ensureIndices(): Promise<void> {
    await this.createIndexIfMissing(COMPROBANTES_INDEX, COMPROBANTES_MAPPING);
    await this.createIndexIfMissing(LEGACY_INDEX, LEGACY_MAPPING);
  }

  private async createIndexIfMissing(index: string, config: any): Promise<void> {
    try {
      const exists = await this.esService.indices.exists({ index });
      if (!exists) {
        await this.esService.indices.create({ index, ...config });
        this.logger.log(`Índice creado: ${index}`);
      }
    } catch (err: any) {
      this.logger.error(`Error al crear índice ${index}: ${err.message}`);
    }
  }

  async deleteAndRecreateIndex(index: string): Promise<void> {
    try {
      const exists = await this.esService.indices.exists({ index });
      if (exists) {
        await this.esService.indices.delete({ index });
        this.logger.log(`Índice eliminado: ${index}`);
      }
      const config = index === COMPROBANTES_INDEX ? COMPROBANTES_MAPPING : LEGACY_MAPPING;
      await this.esService.indices.create({ index, ...config });
      this.logger.log(`Índice recreado: ${index}`);
    } catch (err: any) {
      this.logger.error(`Error al recrear índice ${index}: ${err.message}`);
      throw err;
    }
  }

  // ── Indexación: Comprobantes ──────────────────────────────────────────────
  async indexComprobante(doc: ComprobanteDocument): Promise<void> {
    if (!this.esAvailable) return;
    try {
      await this.esService.index({
        index: COMPROBANTES_INDEX,
        id: doc.id,
        document: doc,
        refresh: 'wait_for',
      });
    } catch (err: any) {
      this.logger.error(`Error al indexar comprobante ${doc.id}: ${err.message}`);
    }
  }

  async deleteComprobante(id: string): Promise<void> {
    if (!this.esAvailable) return;
    try {
      await this.esService.delete({ index: COMPROBANTES_INDEX, id, refresh: 'wait_for' });
    } catch { /* ignorar si no existe */ }
  }

  async bulkIndexComprobantes(
    docs: ComprobanteDocument[],
  ): Promise<{ indexed: number; errors: number }> {
    if (!this.esAvailable || docs.length === 0) return { indexed: 0, errors: 0 };

    const operations = docs.flatMap((doc) => [
      { index: { _index: COMPROBANTES_INDEX, _id: doc.id } },
      doc,
    ]);

    const result = await this.esService.bulk({ operations, refresh: true });
    const errors = result.items.filter((i) => i.index?.error).length;
    return { indexed: docs.length - errors, errors };
  }

  // ── Indexación: Legacy ────────────────────────────────────────────────────
  async indexLegacyRecord(doc: LegacyDocument): Promise<void> {
    if (!this.esAvailable) return;
    try {
      await this.esService.index({
        index: LEGACY_INDEX,
        id: String(doc.id),
        document: doc,
        refresh: 'wait_for',
      });
    } catch (err: any) {
      this.logger.error(`Error al indexar registro legacy ${doc.id}: ${err.message}`);
    }
  }

  async bulkIndexLegacy(
    docs: LegacyDocument[],
  ): Promise<{ indexed: number; errors: number }> {
    if (!this.esAvailable || docs.length === 0) return { indexed: 0, errors: 0 };

    const operations = docs.flatMap((doc) => [
      { index: { _index: LEGACY_INDEX, _id: String(doc.id) } },
      doc,
    ]);

    const result = await this.esService.bulk({ operations, refresh: true });
    const errors = result.items.filter((i) => i.index?.error).length;
    return { indexed: docs.length - errors, errors };
  }

  // ── Búsqueda: Comprobantes ────────────────────────────────────────────────
  async searchComprobantes(
    search: string,
    options: SearchOptions,
  ): Promise<(SearchResult<ComprobanteDocument> & { validados: number; rechazados: number }) | null> {
    if (!this.esAvailable) return null;

    const { page, limit, role, userId } = options;
    const from = (page - 1) * limit;

    const filter: any[] = [];
    if (role !== 'ADMIN' && userId) {
      filter.push({ term: { userId } });
    }

    try {
      const response = await this.esService.search<ComprobanteDocument>({
        index: COMPROBANTES_INDEX,
        from,
        size: limit,
        query: {
          bool: {
            must: [buildSearchQuery(search)],
            filter,
          },
        },
        sort: [{ createdAt: { order: 'desc' } }],
        // Agrega conteo de validados en la misma query (sin coste extra)
        aggs: {
          validados_count: { filter: { term: { sunatSuccess: true } } },
        },
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : (response.hits.total?.value ?? 0);

      const validados = (response.aggregations?.validados_count as any)?.doc_count ?? 0;

      return {
        data: response.hits.hits.map((h) => {
          const doc = h._source!;
          return {
            ...doc,
            // Mantener la forma que espera el frontend
            user: doc.userRuc ? { ruc: doc.userRuc } : undefined,
          } as any;
        }),
        total,
        page,
        totalPages: Math.ceil(total / limit),
        validados,
        rechazados: total - validados,
      };
    } catch (err: any) {
      this.logger.warn(`Error en búsqueda ES (comprobantes): ${err.message}`);
      return null; // señal para hacer fallback a SQL
    }
  }

  // ── Búsqueda: Legacy ──────────────────────────────────────────────────────
  async searchLegacy(
    search: string,
    options: SearchOptions,
  ): Promise<SearchResult<LegacyDocument> | null> {
    if (!this.esAvailable) return null;

    const { page, limit, role, userRuc } = options;
    const from = (page - 1) * limit;

    const filter: any[] = [];
    if (role !== 'ADMIN' && userRuc) {
      filter.push({ term: { numRuc: userRuc.toLowerCase() } });
    }

    try {
      const response = await this.esService.search<LegacyDocument>({
        index: LEGACY_INDEX,
        from,
        size: limit,
        query: {
          bool: {
            must: [buildSearchQuery(search)],
            filter,
          },
        },
        sort: [{ fecha_ingreso_sistema: { order: 'desc' } }],
      });

      const total =
        typeof response.hits.total === 'number'
          ? response.hits.total
          : (response.hits.total?.value ?? 0);

      return {
        data: response.hits.hits.map((h) => ({
          ...h._source!,
          source: 'legacy' as const,
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (err: any) {
      this.logger.warn(`Error en búsqueda ES (legacy): ${err.message}`);
      return null;
    }
  }

  // ── Búsqueda: Empresas únicas (para reporte) ──────────────────────────────
  async searchEmpresas(q: string): Promise<{ ruc: string; nombre: string }[]> {
    if (this.esAvailable) {
      try {
        const response = await this.esService.search({
          index: LEGACY_INDEX,
          size: 0,
          query: q
            ? {
                bool: {
                  should: [
                    { prefix: { numRuc: { value: q } } },
                    { match:  { nombre_empresa: { query: q, fuzziness: 'AUTO' } } },
                  ],
                  minimum_should_match: 1,
                },
              }
            : { match_all: {} },
          aggs: {
            por_ruc: {
              terms: { field: 'numRuc', size: 20 },
              aggs: {
                nombre: { top_hits: { size: 1, _source: ['nombre_empresa'] } },
              },
            },
          },
        });

        const buckets: any[] = (response.aggregations?.por_ruc as any)?.buckets ?? [];
        return buckets.map((b: any) => ({
          ruc: b.key,
          nombre: b.nombre?.hits?.hits?.[0]?._source?.nombre_empresa ?? b.key,
        }));
      } catch {
        // fallback SQL
      }
    }
    return [];
  }

  // ── Estado del cluster ────────────────────────────────────────────────────
  async getStatus(): Promise<any> {
    if (!this.esAvailable) {
      return { available: false, message: 'Elasticsearch no está disponible' };
    }
    try {
      const [health, stats] = await Promise.all([
        this.esService.cluster.health(),
        this.esService.indices.stats({
          index: [COMPROBANTES_INDEX, LEGACY_INDEX].join(','),
        }),
      ]);
      return {
        available: true,
        cluster: { status: health.status, name: health.cluster_name },
        indices: {
          comprobantes: stats.indices?.[COMPROBANTES_INDEX]?.total?.docs?.count ?? 0,
          legacy: stats.indices?.[LEGACY_INDEX]?.total?.docs?.count ?? 0,
        },
      };
    } catch (err: any) {
      return { available: false, error: err.message };
    }
  }
}
