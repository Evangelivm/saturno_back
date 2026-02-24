import { Controller, Get, Post, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { SearchService, COMPROBANTES_INDEX, LEGACY_INDEX } from './search.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../database/prisma.service';
import { PrismaSecondService } from '../database/prisma-second.service';
import { ComprobanteDocument, LegacyDocument } from './interfaces/search-documents.interface';

const BATCH_SIZE = 500;

@Controller('api/search')
@UseGuards(AuthGuard)
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly prisma: PrismaService,
    private readonly prismaSecond: PrismaSecondService,
  ) {}

  // ── GET /api/search/status ──────────────────────────────────────────────
  @Get('status')
  async getStatus() {
    return this.searchService.getStatus();
  }

  // ── POST /api/search/sync/comprobantes ──────────────────────────────────
  // Reindexar todos los comprobantes (solo ADMIN)
  @Post('sync/comprobantes')
  @HttpCode(HttpStatus.OK)
  async syncComprobantes(@CurrentUser() user: any) {
    if (user.role !== 'ADMIN') return { error: 'Acceso denegado' };
    if (!this.searchService.isAvailable) return { error: 'Elasticsearch no está disponible' };

    // Recrear índice para evitar documentos huérfanos
    await this.searchService.deleteAndRecreateIndex(COMPROBANTES_INDEX);

    let total = 0;
    let indexed = 0;
    let lastId: string | undefined;

    do {
      const batch = await this.prisma.comprobante.findMany({
        take: BATCH_SIZE,
        ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
        orderBy: { id: 'asc' },
        include: { user: { select: { ruc: true, nombreEmpresa: true } } },
      });

      if (batch.length === 0) break;
      lastId = batch[batch.length - 1].id;
      total += batch.length;

      const docs: ComprobanteDocument[] = batch.map((c) => ({
        id: c.id,
        numRuc: c.numRuc,
        codComp: c.codComp,
        numeroSerie: c.numeroSerie,
        numero: c.numero,
        fechaEmision: c.fechaEmision.toISOString().split('T')[0],
        monto: c.monto ? parseFloat(c.monto.toString()) : null,
        codigoAlfanumerico: c.codigoAlfanumerico,
        sunatSuccess: c.sunatSuccess,
        sunatMessage: c.sunatMessage,
        sunatEstadoCp: c.sunatEstadoCp,
        createdAt: c.createdAt.toISOString(),
        userId: c.userId,
        userRuc: c.user?.ruc ?? null,
        nombreEmpresa: c.user?.nombreEmpresa ?? null,
        facturaFileId: c.facturaFileId,
        facturaFileName: c.facturaFileName,
        xmlFileId: c.xmlFileId,
        xmlFileName: c.xmlFileName,
        guiaFileId: c.guiaFileId,
        guiaFileName: c.guiaFileName,
        ordenCompraFileId: c.ordenCompraFileId,
        ordenCompraFileName: c.ordenCompraFileName,
        source: 'new',
      }));

      const result = await this.searchService.bulkIndexComprobantes(docs);
      indexed += result.indexed;

      if (batch.length < BATCH_SIZE) break;
    } while (true);

    return { message: 'Sincronización de comprobantes completada', total, indexed };
  }

  // ── POST /api/search/sync/legacy ────────────────────────────────────────
  // Reindexar todos los registros legacy (solo ADMIN)
  // Nota: para > 1M registros esto puede tardar varios minutos.
  @Post('sync/legacy')
  @HttpCode(HttpStatus.OK)
  async syncLegacy(@CurrentUser() user: any) {
    if (user.role !== 'ADMIN') return { error: 'Acceso denegado' };
    if (!this.searchService.isAvailable) return { error: 'Elasticsearch no está disponible' };

    await this.searchService.deleteAndRecreateIndex(LEGACY_INDEX);

    let total = 0;
    let indexed = 0;
    let lastId: number | undefined;

    do {
      const batch = await this.prismaSecond.clientes2024.findMany({
        take: BATCH_SIZE,
        ...(lastId !== undefined ? { skip: 1, cursor: { id: lastId } } : {}),
        orderBy: { id: 'asc' },
        select: {
          id: true, numRuc: true, codComp: true, numeroSerie: true, numero: true,
          fechaEmision: true, monto: true, moneda: true, estadoCp: true,
          estadoRuc: true, condDomiRuc: true, factdoc: true, xmldoc: true,
          guiadoc: true, pedidodoc: true, fecha_ingreso_sistema: true,
          fecha_vencimiento: true, fecha_pago_tesoreria: true,
          estado_contabilidad: true, estado_tesoreria: true,
          tipo_facturacion: true, numero_orden_compra: true,
          nombre_empresa: true, observaciones_escritas: true,
        },
      });

      if (batch.length === 0) break;
      lastId = batch[batch.length - 1].id;
      total += batch.length;

      const toDateStr = (d: Date | null) => (d instanceof Date ? d.toISOString() : d);
      const docs: LegacyDocument[] = batch.map((r) => ({
        ...r,
        fecha_ingreso_sistema: toDateStr(r.fecha_ingreso_sistema),
        fecha_vencimiento: toDateStr(r.fecha_vencimiento),
        fecha_pago_tesoreria: toDateStr(r.fecha_pago_tesoreria),
        tipo_facturacion: r.tipo_facturacion?.toString() ?? null,
        source: 'legacy' as const,
      }));

      const result = await this.searchService.bulkIndexLegacy(docs);
      indexed += result.indexed;

      if (batch.length < BATCH_SIZE) break;
    } while (true);

    return { message: 'Sincronización de historial legacy completada', total, indexed };
  }

  // ── POST /api/search/sync/all ───────────────────────────────────────────
  // Reindexar todo (solo ADMIN)
  @Post('sync/all')
  @HttpCode(HttpStatus.OK)
  async syncAll(@CurrentUser() user: any) {
    if (user.role !== 'ADMIN') return { error: 'Acceso denegado' };
    const [comprobantes, legacy] = await Promise.all([
      this.syncComprobantes(user),
      this.syncLegacy(user),
    ]);
    return { comprobantes, legacy };
  }
}
