import { Injectable } from '@nestjs/common';
import { DuckDBValue } from '@duckdb/node-api';
import { DuckDbService } from './duckdb.service';

export type TipoDoc = 'factura' | 'xml' | 'guia' | 'pedido';

const CAMPO_MAP: Record<TipoDoc, string> = {
  factura: 'factdoc',
  xml: 'xmldoc',
  guia: 'guiadoc',
  pedido: 'pedidodoc',
};

// Mismas columnas que LEGACY_SELECT en historial-legacy.service.ts (antes vía Prisma).
const LEGACY_COLUMNS = [
  'id', 'numRuc', 'codComp', 'numeroSerie', 'numero',
  'fechaEmision', 'monto', 'moneda', 'estadoCp', 'estadoRuc',
  'condDomiRuc', 'factdoc', 'xmldoc', 'guiadoc', 'pedidodoc',
  'fecha_ingreso_sistema', 'fecha_vencimiento', 'fecha_pago_tesoreria',
  'estado_contabilidad', 'estado_tesoreria', 'tipo_facturacion',
  'numero_orden_compra', 'nombre_empresa', 'observaciones_escritas',
];

// Columnas que usa generateLegacyReport (reportes.service.ts) para armar el Excel — único consumidor de findByDateRange.
// SELECT * ahí traía las ~55 columnas de la tabla por cada fila y en rangos grandes (ej. un año, 11k+ filas)
// terminaba pesando más que la ganancia de tener la fecha ya parseada. Seleccionar solo lo que se usa lo evita.
const REPORT_COLUMNS = [
  'id', 'numRuc', 'nombre_empresa', 'codComp', 'numeroSerie', 'numero',
  'fechaEmision', 'fecha_vencimiento', 'monto', 'moneda', 'estadoCp',
  'estado_contabilidad', 'estado_tesoreria', 'fecha_pago_tesoreria',
  'tipo_facturacion', 'numero_orden_compra', 'condPago', 'fecha_estimada_pago',
  'fecha_ingreso_sistema', 'observaciones_escritas', 'factdoc', 'xmldoc', 'guiadoc', 'pedidodoc',
];

const ORDER_BY_MAP: Record<string, (order: 'ASC' | 'DESC') => string> = {
  numero: (o) => `numeroSerie ${o}, numero ${o}`,
  empresa: (o) => `nombre_empresa ${o}`,
  estado: (o) => `estadoCp ${o}`,
  monto: (o) => `TRY_CAST(monto AS DOUBLE) ${o}`,
  fecha: (o) => `fecha_emision_dt ${o}`,
};

interface RucDateFilter {
  ruc?: string;
  desde?: string;
  hasta?: string;
}

@Injectable()
export class LegacyClientesRepository {
  constructor(private readonly duckDb: DuckDbService) {}

  async search(q: string): Promise<{ ruc: string; nombre: string }[]> {
    const rows = await this.duckDb.queryRows<{ numRuc: string | null; nombre_empresa: string | null }>(
      `SELECT DISTINCT numRuc, nombre_empresa FROM clientes2024
       WHERE numRuc ILIKE $like OR nombre_empresa ILIKE $like
       LIMIT 20`,
      { like: `%${q}%` },
    );
    return rows.map((r) => ({ ruc: r.numRuc ?? '', nombre: r.nombre_empresa ?? r.numRuc ?? '' }));
  }

  async findPage(opts: {
    ruc?: string;
    search?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
    const { ruc, search, page, limit, sortBy, sortOrder } = opts;
    const offset = (page - 1) * limit;
    const order = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: Record<string, DuckDBValue> = {};
    if (ruc) {
      conditions.push('numRuc = $ruc');
      params.ruc = ruc;
    }
    if (search) {
      conditions.push('(numRuc ILIKE $search OR numeroSerie ILIKE $search OR nombre_empresa ILIKE $search OR numero ILIKE $search)');
      params.search = `%${search}%`;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = ORDER_BY_MAP[sortBy ?? '']?.(order) ?? 'fecha_ingreso_sistema DESC, id DESC';

    const [data, countRows] = await Promise.all([
      this.duckDb.queryRows(
        `SELECT ${LEGACY_COLUMNS.join(', ')} FROM clientes2024 ${where} ORDER BY ${orderBy} LIMIT $limit OFFSET $offset`,
        { ...params, limit, offset },
      ),
      this.duckDb.queryRows<{ total: string | number }>(`SELECT COUNT(*) AS total FROM clientes2024 ${where}`, params),
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    return {
      data: data.map((r) => ({ ...r, source: 'legacy' as const })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Filas del rango con las columnas que necesita generateLegacyReport (único consumidor).
   * Usa queryRowsRaw (sin conversión JSON) — el resultado nunca sale directo como
   * respuesta JSON, solo alimenta ExcelJS, así que las fechas envueltas no son problema
   * y evitarnos convertir columnas de más es lo que hace rápido este camino en rangos grandes.
   */
  async findByDateRange(filter: RucDateFilter): Promise<any[]> {
    const { where, params } = this.buildRucDateWhere(filter);
    return this.duckDb.queryRowsRaw(
      `SELECT ${REPORT_COLUMNS.join(', ')} FROM clientes2024 ${where} ORDER BY id DESC`,
      params,
    );
  }

  async getR2Key(id: number, tipo: TipoDoc): Promise<string | undefined> {
    const rows = await this.duckDb.queryRows<{ key: string }>(
      'SELECT key FROM transferencia_resultado WHERE rowId = $id AND tipo = $tipo',
      { id, tipo },
    );
    return rows[0]?.key;
  }

  async estimateBatchSize(
    filter: RucDateFilter,
    tipos: TipoDoc[],
  ): Promise<{ totalBytes: number; totalArchivos: number; archivosSinTamano: number }> {
    const { where, params } = this.buildRucDateWhere(filter);
    const docsCte = this.buildDocsCte(tipos);
    if (!docsCte) return { totalBytes: 0, totalArchivos: 0, archivosSinTamano: 0 };

    const rows = await this.duckDb.queryRows<{ totalArchivos: string | number; archivosSinTamano: string | number; totalBytes: string | number }>(
      `WITH filtered AS (SELECT id, factdoc, xmldoc, guiadoc, pedidodoc FROM clientes2024 ${where}),
       docs AS (${docsCte})
       SELECT
         COUNT(*) AS "totalArchivos",
         COUNT(*) FILTER (WHERE r.size IS NULL) AS "archivosSinTamano",
         COALESCE(SUM(TRY_CAST(r.size AS BIGINT)), 0) AS "totalBytes"
       FROM docs d
       LEFT JOIN legacy_reconciliacion r ON r.rowId::BIGINT = d.id::BIGINT AND r.tipo = d.tipo`,
      params,
    );

    const row = rows[0];
    return {
      totalArchivos: Number(row?.totalArchivos ?? 0),
      archivosSinTamano: Number(row?.archivosSinTamano ?? 0),
      totalBytes: Number(row?.totalBytes ?? 0),
    };
  }

  /** Una fila por (registro, tipo) con el nombre de archivo y, si existe, la key de R2 — para armar el ZIP de descarga masiva. */
  async getFileRefs(
    filter: RucDateFilter,
    tipos: TipoDoc[],
  ): Promise<{ id: number; numeroSerie: string | null; numero: string | null; tipo: TipoDoc; fileName: string; r2Key: string | null }[]> {
    const { where, params } = this.buildRucDateWhere(filter);
    const docsCte = this.buildDocsCte(tipos, true);
    if (!docsCte) return [];

    return this.duckDb.queryRows(
      `WITH filtered AS (SELECT id, numeroSerie, numero, factdoc, xmldoc, guiadoc, pedidodoc FROM clientes2024 ${where}),
       docs AS (${docsCte})
       SELECT d.id, d.numeroSerie, d.numero, d.tipo, d.fileName, t.key AS r2Key
       FROM docs d
       LEFT JOIN transferencia_resultado t ON t.rowId::BIGINT = d.id::BIGINT AND t.tipo = d.tipo
       ORDER BY d.id DESC`,
      params,
    );
  }

  private buildRucDateWhere(filter: RucDateFilter): { where: string; params: Record<string, DuckDBValue> } {
    const conditions: string[] = [];
    const params: Record<string, DuckDBValue> = {};
    if (filter.ruc) {
      conditions.push('numRuc = $ruc');
      params.ruc = filter.ruc;
    }
    if (filter.desde) {
      conditions.push('fecha_emision_dt >= $desde::DATE');
      params.desde = filter.desde;
    }
    if (filter.hasta) {
      conditions.push('fecha_emision_dt <= $hasta::DATE');
      params.hasta = filter.hasta;
    }
    return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  /** UNION ALL sobre las 4 columnas de documento, una rama solo para los tipos pedidos. */
  private buildDocsCte(tipos: TipoDoc[], withNumero = false): string | null {
    const branches = tipos
      .filter((tipo) => CAMPO_MAP[tipo])
      .map((tipo) => {
        const campo = CAMPO_MAP[tipo];
        const cols = withNumero ? 'id, numeroSerie, numero' : 'id';
        return `SELECT ${cols}, '${tipo}' AS tipo, ${campo} AS fileName FROM filtered WHERE ${campo} IS NOT NULL`;
      });
    return branches.length > 0 ? branches.join(' UNION ALL ') : null;
  }
}
