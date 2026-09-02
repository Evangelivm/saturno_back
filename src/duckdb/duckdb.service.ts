import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DuckDBInstance, DuckDBValue } from '@duckdb/node-api';
import * as fs from 'fs';
import * as path from 'path';
import { buildMysqlAttachString, escapeSqlLiteral } from './mysql-connection-string.util';

const REFRESH_INTERVAL_NAME = 'duckdb-legacy-refresh';
const DEFAULT_REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 min — clientes2024 sigue editándose (tesorería/observaciones)

/**
 * Copia local (archivo .duckdb) de `clientes2024`, refrescada periódicamente desde
 * la MariaDB "segunda" (DATABASE_URL_SECOND) vía la extensión mysql de DuckDB.
 *
 * clientes2024 no tiene ningún índice más allá de `id` y `fechaEmision` es VARCHAR
 * (requiere STR_TO_DATE en cada query contra MySQL). Acá se materializa una sola
 * vez por refresco con la fecha ya parseada a DATE, así reportes.service.ts y
 * historial-legacy.service.ts pueden filtrar/ordenar por cualquier columna sin
 * pagar ese costo en cada request.
 */
@Injectable()
export class DuckDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckDbService.name);
  private instance!: DuckDBInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    const filePath = this.config.get<string>('DUCKDB_FILE_PATH') || './data/legacy.duckdb';
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    this.instance = await DuckDBInstance.create(filePath);

    await this.refresh();

    const intervalMs = Number(this.config.get<string>('DUCKDB_REFRESH_INTERVAL_MS')) || DEFAULT_REFRESH_INTERVAL_MS;
    const interval = setInterval(() => {
      this.refresh().catch((err) => this.logger.error(`Refresco periódico falló: ${err?.message ?? err}`));
    }, intervalMs);
    this.schedulerRegistry.addInterval(REFRESH_INTERVAL_NAME, interval);
    this.logger.log(`Refresco periódico registrado cada ${Math.round(intervalMs / 60000)} min`);
  }

  onModuleDestroy() {
    if (this.schedulerRegistry.doesExist('interval', REFRESH_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(REFRESH_INTERVAL_NAME);
    }
  }

  /**
   * Vuelve a copiar clientes2024 desde MariaDB y (re)crea las vistas sobre los
   * JSONL de scripts/output/ (índice de keys R2 + tamaños de la migración legacy).
   * Se puede llamar manualmente (endpoint admin) además del intervalo periódico.
   */
  async refresh(): Promise<void> {
    const attachString = buildMysqlAttachString(process.env.DATABASE_URL_SECOND as string);
    const connection = await this.instance.connect();

    try {
      await connection.run('INSTALL mysql');
      await connection.run('LOAD mysql');
      await connection.run(`ATTACH '${escapeSqlLiteral(attachString)}' AS legacy_mysql (TYPE mysql)`);

      try {
        await connection.run(`
          CREATE OR REPLACE TABLE clientes2024 AS
          SELECT *, TRY_STRPTIME(fechaEmision, '%d/%m/%Y')::DATE AS fecha_emision_dt
          FROM legacy_mysql.clientes2024
        `);
        const reader = await connection.runAndReadAll('SELECT COUNT(*) AS total FROM clientes2024');
        const total = Number(reader.getRowObjectsJson()[0]?.total ?? 0);
        this.logger.log(`✅ clientes2024 refrescada en DuckDB: ${total} filas`);
      } finally {
        await connection.run('DETACH legacy_mysql');
      }

      await this.refreshLegacyR2Views(connection);
    } finally {
      connection.closeSync();
    }
  }

  /** Vistas sobre los JSONL estáticos de la migración Drive → R2 (no requieren refresco periódico). */
  private async refreshLegacyR2Views(connection: Awaited<ReturnType<DuckDBInstance['connect']>>): Promise<void> {
    await this.createNdjsonView(
      connection,
      'transferencia_resultado',
      path.join(process.cwd(), 'scripts', 'output', 'transferencia-resultado.jsonl'),
      "SELECT rowId, tipo, key FROM read_ndjson_auto('%PATH%') WHERE estado = 'OK'",
      'SELECT NULL::BIGINT AS rowId, NULL::VARCHAR AS tipo, NULL::VARCHAR AS key WHERE FALSE',
    );
    await this.createNdjsonView(
      connection,
      'legacy_reconciliacion',
      path.join(process.cwd(), 'scripts', 'output', 'legacy-drive-reconciliacion.jsonl'),
      "SELECT rowId, tipo, size FROM read_ndjson_auto('%PATH%')",
      'SELECT NULL::BIGINT AS rowId, NULL::VARCHAR AS tipo, NULL AS size WHERE FALSE',
    );
  }

  private async createNdjsonView(
    connection: Awaited<ReturnType<DuckDBInstance['connect']>>,
    viewName: string,
    filePath: string,
    selectTemplate: string,
    emptyFallback: string,
  ): Promise<void> {
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`⚠️  No se encontró ${filePath}. La vista ${viewName} quedará vacía.`);
      await connection.run(`CREATE OR REPLACE VIEW ${viewName} AS ${emptyFallback}`);
      return;
    }
    const normalizedPath = filePath.split(path.sep).join('/');
    const select = selectTemplate.replace('%PATH%', escapeSqlLiteral(normalizedPath));
    await connection.run(`CREATE OR REPLACE VIEW ${viewName} AS ${select}`);
  }

  /** Ejecuta una query y devuelve las filas como objetos JS planos (fechas/decimales ya convertidos a string/number). */
  async queryRows<T = Record<string, unknown>>(sql: string, params?: Record<string, DuckDBValue>): Promise<T[]> {
    const connection = await this.instance.connect();
    try {
      const reader = params ? await connection.runAndReadAll(sql, params) : await connection.runAndReadAll(sql);
      return reader.getRowObjectsJson() as T[];
    } finally {
      connection.closeSync();
    }
  }

  /**
   * Igual que queryRows, pero sin la conversión a JSON de cada celda — las columnas
   * DATE/TIMESTAMP vuelven envueltas (DuckDBDateValue/DuckDBTimestampValue) en vez de
   * string. Esas envolturas funcionan bien con `new Date(valor)` (su toString() da
   * "2024-04-10" o "2024-04-10 10:20:30", que Date parsea directo) pero NO deben
   * exponerse tal cual en una respuesta JSON de la API (JSON.stringify las serializa
   * como {days:N}, no como fecha). Usar solo para datos que se consumen en el propio
   * backend (ej. armar un Excel), nunca para results que van directo al cliente.
   */
  async queryRowsRaw<T = Record<string, unknown>>(sql: string, params?: Record<string, DuckDBValue>): Promise<T[]> {
    const connection = await this.instance.connect();
    try {
      const reader = params ? await connection.runAndReadAll(sql, params) : await connection.runAndReadAll(sql);
      return reader.getRowObjects() as T[];
    } finally {
      connection.closeSync();
    }
  }
}
