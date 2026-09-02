import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaSecondService } from '../database/prisma-second.service';
import { SearchService } from '../search/search.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { R2Service } from '../r2/r2.service';
import { LegacyClientesRepository, TipoDoc } from '../duckdb/legacy-clientes.repository';

@Injectable()
export class HistorialLegacyService {
  constructor(
    private readonly prismaSecond: PrismaSecondService,
    private readonly searchService: SearchService,
    private readonly driveService: GoogleDriveService,
    private readonly r2Service: R2Service,
    private readonly legacyClientes: LegacyClientesRepository,
  ) {}

  async findAll(
    userRuc: string,
    role: string,
    options: { page?: number; limit?: number; ruc?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' } = {},
  ) {
    const { page = 1, limit = 30, ruc, search, sortBy, sortOrder } = options;
    const filterRuc = role === 'ADMIN' ? (ruc ?? undefined) : userRuc;

    // ── Búsqueda con Elasticsearch (monto no está indexado en ES y fecha
    //    requiere orden cronológico real → DuckDB directo, que ya lo resuelve barato) ──
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

    // ── Sin ES (no disponible, sin búsqueda, o sort por monto/fecha) → DuckDB ──
    return this.legacyClientes.findPage({ ruc: filterRuc, search, page, limit, sortBy, sortOrder });
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

    const r2Key = await this.legacyClientes.getR2Key(id, tipo);
    if (r2Key) {
      const { stream, contentType } = await this.r2Service.getObjectStream(r2Key);
      return { stream, mimeType: contentType ?? 'application/octet-stream', name: fileName };
    }

    const file = await this.driveService.findFileInLegacyFolder(fileName, tipo);
    if (!file) throw new NotFoundException(`Archivo "${fileName}" no encontrado en Google Drive`);

    const stream = await this.driveService.downloadStream(file.id);
    return { stream, mimeType: file.mimeType, name: file.name };
  }
}
