import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaSecondService } from '../database/prisma-second.service';
import { SearchService } from '../search/search.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';

type TipoDoc = 'factura' | 'xml' | 'guia' | 'pedido';

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
    options: { page?: number; limit?: number; ruc?: string; search?: string } = {},
  ) {
    const { page = 1, limit = 30, ruc, search } = options;
    const filterRuc = role === 'ADMIN' ? (ruc ?? undefined) : userRuc;

    // ── Búsqueda con Elasticsearch ──────────────────────────────────────────
    if (search) {
      const esResult = await this.searchService.searchLegacy(search, {
        page,
        limit,
        role,
        userRuc: filterRuc,
      });

      if (esResult) {
        return esResult;
      }

      // Fallback SQL (ES no disponible)
      return this.sqlFindAll(filterRuc, page, limit, search);
    }

    // ── Sin búsqueda: paginación SQL normal ─────────────────────────────────
    return this.sqlFindAll(filterRuc, page, limit);
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
  ) {
    const skip = (page - 1) * limit;
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

    const [items, total] = await Promise.all([
      this.prismaSecond.clientes2024.findMany({
        where,
        orderBy: [{ fecha_ingreso_sistema: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true, numRuc: true, codComp: true, numeroSerie: true, numero: true,
          fechaEmision: true, monto: true, moneda: true, estadoCp: true, estadoRuc: true,
          condDomiRuc: true, factdoc: true, xmldoc: true, guiadoc: true, pedidodoc: true,
          fecha_ingreso_sistema: true, fecha_vencimiento: true, fecha_pago_tesoreria: true,
          estado_contabilidad: true, estado_tesoreria: true, tipo_facturacion: true,
          numero_orden_compra: true, nombre_empresa: true, observaciones_escritas: true,
        },
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
}
