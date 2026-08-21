import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from 'prisma-second-client';
import { PrismaSecondService } from '../database/prisma-second.service';
import { SearchService } from '../search/search.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';

type TipoDoc = 'factura' | 'xml' | 'guia' | 'pedido';

const LEGACY_SELECT = {
  id: true, numRuc: true, codComp: true, numeroSerie: true, numero: true,
  fechaEmision: true, monto: true, moneda: true, estadoCp: true, estadoRuc: true,
  condDomiRuc: true, factdoc: true, xmldoc: true, guiadoc: true, pedidodoc: true,
  fecha_ingreso_sistema: true, fecha_vencimiento: true, fecha_pago_tesoreria: true,
  estado_contabilidad: true, estado_tesoreria: true, tipo_facturacion: true,
  numero_orden_compra: true, nombre_empresa: true, observaciones_escritas: true,
} as const;

// ── Orden por columna ────────────────────────────────────────────────────────
const LEGACY_SORTABLE_FIELDS: Record<string, (order: 'asc' | 'desc') => any> = {
  numero: (order) => [{ numeroSerie: order }, { numero: order }],
  empresa: (order) => [{ nombre_empresa: order }],
  estado: (order) => [{ estadoCp: order }],
  monto: (order) => [{ monto: order }],
};

function buildLegacyOrderBy(sortBy?: string, sortOrder?: 'asc' | 'desc') {
  const build = sortBy ? LEGACY_SORTABLE_FIELDS[sortBy] : undefined;
  if (!build) return [{ fecha_ingreso_sistema: 'desc' as const }, { id: 'desc' as const }];
  return build(sortOrder === 'asc' ? 'asc' : 'desc');
}

@Injectable()
export class HistorialLegacyService {
  constructor(
    private readonly prismaSecond: PrismaSecondService,
    private readonly searchService: SearchService,
    private readonly driveService: GoogleDriveService,
  ) {}

  async findAll(
    userRuc: string,
    role: string,
    options: { page?: number; limit?: number; ruc?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {},
  ) {
    const { page = 1, limit = 30, ruc, search, sortBy, sortOrder } = options;
    const filterRuc = role === 'ADMIN' ? (ruc ?? undefined) : userRuc;

    // ── Búsqueda con Elasticsearch (monto no está indexado en ES y fecha
    //    requiere STR_TO_DATE para orden cronológico real → SQL directo) ──────
    if (search && sortBy !== 'monto' && sortBy !== 'fecha') {
      const esResult = await this.searchService.searchLegacy(search, {
        page,
        limit,
        role,
        userRuc: filterRuc,
        sortBy,
        sortOrder,
      });

      if (esResult) {
        return esResult;
      }
    }

    // ── Sin ES (no disponible, sin búsqueda, o sort por monto) → SQL directo ──
    return this.sqlFindAll(filterRuc, page, limit, search, sortBy, sortOrder);
  }

  async getFile(id: number, tipo: TipoDoc) {
    const record = await this.prismaSecond.clientes2024.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Registro no encontrado');

    const campoMap: Record<TipoDoc, string | null> = {
      factura: record.factdoc ?? null,
      xml:     record.xmldoc ?? null,
      guia:    record.guiadoc ?? null,
      pedido:  record.pedidodoc ?? null,
    };

    const fileName = campoMap[tipo];
    if (!fileName) throw new NotFoundException(`No hay archivo de tipo "${tipo}" para este registro`);

    const file = await this.driveService.findFileInLegacyFolder(fileName, tipo);
    if (!file) throw new NotFoundException(`Archivo "${fileName}" no encontrado en Google Drive`);

    const stream = await this.driveService.downloadStream(file.id);
    return { stream, mimeType: file.mimeType, name: file.name };
  }

  // ── Consulta SQL (fallback o sin búsqueda) ────────────────────────────────
  private async sqlFindAll(
    filterRuc: string | undefined,
    page: number,
    limit: number,
    search?: string,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
  ) {
    // fechaEmision está guardada como texto "dd/MM/yyyy": requiere STR_TO_DATE
    // para ordenar cronológicamente en vez de alfabéticamente.
    if (sortBy === 'fecha') {
      return this.sqlFindAllByFecha(filterRuc, page, limit, search, sortOrder);
    }

    const skip = (page - 1) * limit;
    const where = this.buildLegacyWhere(filterRuc, search);

    const [items, total] = await Promise.all([
      this.prismaSecond.clientes2024.findMany({
        where,
        orderBy: buildLegacyOrderBy(sortBy, sortOrder),
        skip,
        take: limit,
        select: LEGACY_SELECT,
      }),
      this.prismaSecond.clientes2024.count({ where }),
    ]);

    return {
      data: items.map((r) => ({ ...r, source: 'legacy' as const })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ── Orden cronológico real por fecha de emisión ───────────────────────────
  private async sqlFindAllByFecha(
    filterRuc: string | undefined,
    page: number,
    limit: number,
    search: string | undefined,
    sortOrder?: 'asc' | 'desc',
  ) {
    const skip = (page - 1) * limit;
    const order = sortOrder === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const conditions: Prisma.Sql[] = [];
    if (filterRuc) conditions.push(Prisma.sql`numRuc = ${filterRuc}`);
    if (search) {
      const like = `%${search}%`;
      conditions.push(Prisma.sql`(numRuc LIKE ${like} OR numeroSerie LIKE ${like} OR nombre_empresa LIKE ${like} OR numero LIKE ${like})`);
    }
    const whereSql = conditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;

    const [idRows, totalRows] = await Promise.all([
      this.prismaSecond.$queryRaw<{ id: number }[]>`
        SELECT id FROM clientes2024
        ${whereSql}
        ORDER BY STR_TO_DATE(fechaEmision, '%d/%m/%Y') ${order}, id ${order}
        LIMIT ${limit} OFFSET ${skip}
      `,
      this.prismaSecond.$queryRaw<{ total: bigint | number }[]>`
        SELECT COUNT(*) as total FROM clientes2024 ${whereSql}
      `,
    ]);

    const total = Number(totalRows[0]?.total ?? 0);
    const ids = idRows.map((r) => r.id);
    if (ids.length === 0) {
      return { data: [], total, page, totalPages: Math.ceil(total / limit) };
    }

    // findMany con "in" no garantiza el orden: reordenamos según el orden cronológico ya calculado
    const items = await this.prismaSecond.clientes2024.findMany({
      where: { id: { in: ids } },
      select: LEGACY_SELECT,
    });
    const byId = new Map(items.map((r) => [r.id, r]));
    const ordered = ids.map((id) => byId.get(id)).filter((r): r is typeof items[number] => !!r);

    return {
      data: ordered.map((r) => ({ ...r, source: 'legacy' as const })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  private buildLegacyWhere(filterRuc: string | undefined, search: string | undefined): any {
    const where: any = filterRuc ? { numRuc: filterRuc } : {};

    if (search) {
      const searchConditions = [
        { numRuc:         { contains: search } },
        { numeroSerie:    { contains: search } },
        { nombre_empresa: { contains: search } },
        { numero:         { contains: search } },
      ];
      if (where.numRuc) {
        where.AND = [{ numRuc: where.numRuc }, { OR: searchConditions }];
        delete where.numRuc;
      } else {
        where.OR = searchConditions;
      }
    }

    return where;
  }
}
