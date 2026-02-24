import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SunatService } from '../sunat/sunat.service';
import { SearchService } from '../search/search.service';
import { ComprobanteDocument } from '../search/interfaces/search-documents.interface';
import { CreateComprobanteDto } from './dto/create-comprobante.dto';
import { generateAlphanumericCode } from '../common/utils/generate-code.util';

@Injectable()
export class ComprobantesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sunatService: SunatService,
    private readonly searchService: SearchService,
  ) {}

  async create(userId: string, dto: CreateComprobanteDto) {
    // 1. Validar con SUNAT
    const sunatResponse = await this.sunatService.validateComprobante({
      userId,
      ...dto,
    });

    // 2. Generar código alfanumérico único
    const codigoAlfanumerico = await this.generateUniqueCode();

    // 3. Guardar en BD
    const comprobante = await this.prisma.comprobante.create({
      data: {
        userId,
        numRuc: dto.numRuc,
        codComp: dto.codComp,
        numeroSerie: dto.numeroSerie,
        numero: dto.numero,
        fechaEmision: this.parseDate(dto.fechaEmision),
        tipoFactura: dto.tipoFactura,
        numeroOrden: dto.numeroOrden,
        monto: dto.monto,
        codigoAlfanumerico,
        sunatSuccess: sunatResponse.success,
        sunatMessage: sunatResponse.message,
        sunatEstadoCp: sunatResponse.data?.estadoCp ? parseInt(sunatResponse.data.estadoCp, 10) : null,
        sunatEstadoRuc: sunatResponse.data?.estadoRuc,
        sunatCondDomiRuc: sunatResponse.data?.condDomiRuc,
        sunatObservaciones: sunatResponse.data?.observaciones || [],
        sunatErrorCode: sunatResponse.errorCode,
      },
      include: { user: { select: { ruc: true, nombreEmpresa: true } } },
    });

    // 4. Indexar en Elasticsearch (fire-and-forget)
    this.searchService
      .indexComprobante(this.toEsDocument(comprobante))
      .catch(() => { /* silencioso */ });

    return {
      success: sunatResponse.success,
      message: sunatResponse.message,
      data: {
        id: comprobante.id,
        codigoAlfanumerico: comprobante.codigoAlfanumerico,
        ...sunatResponse.data,
      },
    };
  }

  async findAll(
    userId: string,
    role: string,
    options: { page?: number; limit?: number; search?: string } = {},
  ) {
    const { page = 1, limit = 30, search } = options;
    const baseWhere: any = role === 'ADMIN' ? {} : { userId };

    // ── Búsqueda con Elasticsearch (evita los COUNT SQL si ES responde) ──────
    if (search) {
      if (this.searchService.isAvailable) {
        const esResult = await this.searchService.searchComprobantes(search, {
          page,
          limit,
          role,
          userId,
        });

        if (esResult) {
          return {
            data: esResult.data,
            total: esResult.total,
            page: esResult.page,
            totalPages: esResult.totalPages,
            stats: {
              total: esResult.total,
              validados: esResult.validados,
              rechazados: esResult.rechazados,
            },
          };
        }
      }

      // Fallback SQL (ES no disponible)
      const searchWhere = {
        ...baseWhere,
        OR: [
          { numRuc: { contains: search } },
          { codigoAlfanumerico: { contains: search } },
          { numeroSerie: { contains: search } },
        ],
      };
      const skip = (page - 1) * limit;
      const [items, searchTotal, searchValidados] = await Promise.all([
        this.prisma.comprobante.findMany({
          where: searchWhere,
          include: role === 'ADMIN' ? { user: { select: { ruc: true } } } : undefined,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
        }),
        this.prisma.comprobante.count({ where: searchWhere }),
        this.prisma.comprobante.count({ where: { ...searchWhere, sunatSuccess: true } }),
      ]);

      return {
        data: items,
        total: searchTotal,
        page,
        totalPages: Math.ceil(searchTotal / limit),
        stats: { total: searchTotal, validados: searchValidados, rechazados: searchTotal - searchValidados },
      };
    }

    // ── Sin búsqueda: stats globales desde BD ────────────────────────────────
    const [totalScope, validadosScope] = await Promise.all([
      this.prisma.comprobante.count({ where: baseWhere }),
      this.prisma.comprobante.count({ where: { ...baseWhere, sunatSuccess: true } }),
    ]);
    const stats = {
      total: totalScope,
      validados: validadosScope,
      rechazados: totalScope - validadosScope,
    };

    // ── Sin búsqueda: paginación SQL normal ─────────────────────────────────
    const skip = (page - 1) * limit;
    const items = await this.prisma.comprobante.findMany({
      where: baseWhere,
      include: role === 'ADMIN' ? { user: { select: { ruc: true } } } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: limit,
    });

    return { data: items, total: totalScope, page, totalPages: Math.ceil(totalScope / limit), stats };
  }

  async findOne(userId: string, role: string, id: string) {
    const comprobante = await this.prisma.comprobante.findUnique({ where: { id } });
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado');
    if (role !== 'ADMIN' && comprobante.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver este comprobante');
    }
    return comprobante;
  }

  async updateFileInfo(
    userId: string,
    role: string,
    comprobanteId: string,
    tipoArchivo: 'factura' | 'xml' | 'guia' | 'ordenCompra',
    fileId: string,
    fileName: string,
  ) {
    const comprobante = await this.prisma.comprobante.findUnique({ where: { id: comprobanteId } });
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado');
    if (role !== 'ADMIN' && comprobante.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para modificar este comprobante');
    }

    const updateData: any = { updatedAt: new Date() };

    if (tipoArchivo === 'factura') {
      updateData.facturaFileId = fileId;
      updateData.facturaFileName = fileName;
      updateData.facturaUploadedAt = new Date();
    } else if (tipoArchivo === 'xml') {
      updateData.xmlFileId = fileId;
      updateData.xmlFileName = fileName;
      updateData.xmlUploadedAt = new Date();
    } else if (tipoArchivo === 'guia') {
      updateData.guiaFileId = fileId;
      updateData.guiaFileName = fileName;
      updateData.guiaUploadedAt = new Date();
    } else {
      updateData.ordenCompraFileId = fileId;
      updateData.ordenCompraFileName = fileName;
      updateData.ordenCompraUploadedAt = new Date();
    }

    const updated = await this.prisma.comprobante.update({
      where: { id: comprobanteId },
      data: updateData,
      include: { user: { select: { ruc: true, nombreEmpresa: true } } },
    });

    // Mantener ES sincronizado con los nuevos fileIds
    this.searchService
      .indexComprobante(this.toEsDocument(updated))
      .catch(() => { /* silencioso */ });

    return { success: true, message: 'Archivo registrado correctamente', data: { fileId, fileName } };
  }

  async findByDateRange(userId: string, role: string, from: string, to: string, tipos: string[], ruc?: string) {
    const gte = new Date(from + 'T00:00:00Z');
    const lte = new Date(to + 'T23:59:59Z');

    let filterUserId: string | undefined;
    if (role === 'ADMIN') {
      if (ruc) {
        const targetUser = await this.prisma.user.findUnique({ where: { ruc } });
        if (targetUser) filterUserId = targetUser.id;
      }
    } else {
      filterUserId = userId;
    }

    const uploadedAtFields: Record<string, string> = {
      factura: 'facturaUploadedAt',
      xml: 'xmlUploadedAt',
      guia: 'guiaUploadedAt',
      ordenCompra: 'ordenCompraUploadedAt',
    };

    const orConditions = tipos
      .filter((t) => uploadedAtFields[t])
      .map((t) => ({ [uploadedAtFields[t]]: { gte, lte } }));

    return this.prisma.comprobante.findMany({
      where: { ...(filterUserId ? { userId: filterUserId } : {}), OR: orConditions },
      orderBy: { createdAt: 'asc' },
    });
  }

  async revalidate(userId: string, role: string, id: string) {
    const comprobante = await this.prisma.comprobante.findUnique({ where: { id } });
    if (!comprobante) throw new NotFoundException('Comprobante no encontrado');
    if (role !== 'ADMIN' && comprobante.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para revalidar este comprobante');
    }

    const fecha = comprobante.fechaEmision;
    const fechaEmision = `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${fecha.getUTCFullYear()}`;

    const sunatResponse = await this.sunatService.validateComprobante({
      userId: comprobante.userId,
      numRuc: comprobante.numRuc,
      codComp: comprobante.codComp,
      numeroSerie: comprobante.numeroSerie,
      numero: comprobante.numero,
      fechaEmision,
      monto: comprobante.monto ? Number(comprobante.monto) : undefined,
    });

    const updated = await this.prisma.comprobante.update({
      where: { id },
      data: {
        sunatSuccess: sunatResponse.success,
        sunatMessage: sunatResponse.message,
        sunatEstadoCp: sunatResponse.data?.estadoCp ? parseInt(sunatResponse.data.estadoCp, 10) : null,
        sunatEstadoRuc: sunatResponse.data?.estadoRuc,
        sunatCondDomiRuc: sunatResponse.data?.condDomiRuc,
        sunatObservaciones: sunatResponse.data?.observaciones || [],
        sunatErrorCode: sunatResponse.errorCode,
      },
      include: { user: { select: { ruc: true, nombreEmpresa: true } } },
    });

    // Actualizar estado en Elasticsearch
    this.searchService
      .indexComprobante(this.toEsDocument(updated))
      .catch(() => { /* silencioso */ });

    return { success: sunatResponse.success, message: sunatResponse.message, data: sunatResponse.data };
  }

  // ── Helpers privados ───────────────────────────────────────────────────────
  private toEsDocument(c: any): ComprobanteDocument {
    return {
      id: c.id,
      numRuc: c.numRuc,
      codComp: c.codComp,
      numeroSerie: c.numeroSerie,
      numero: c.numero,
      fechaEmision: c.fechaEmision instanceof Date
        ? c.fechaEmision.toISOString().split('T')[0]
        : c.fechaEmision,
      monto: c.monto ? parseFloat(c.monto.toString()) : null,
      codigoAlfanumerico: c.codigoAlfanumerico,
      sunatSuccess: c.sunatSuccess,
      sunatMessage: c.sunatMessage,
      sunatEstadoCp: c.sunatEstadoCp,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
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
    };
  }

  private async generateUniqueCode(): Promise<string> {
    let code: string;
    let exists: boolean;
    do {
      code = generateAlphanumericCode(10);
      const existing = await this.prisma.comprobante.findUnique({
        where: { codigoAlfanumerico: code },
      });
      exists = !!existing;
    } while (exists);
    return code;
  }

  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split('/').map(Number);
    return new Date(year, month - 1, day);
  }
}
