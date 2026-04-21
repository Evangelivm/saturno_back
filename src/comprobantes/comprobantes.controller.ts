import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { tmpdir } from 'os';
import { unlink } from 'fs/promises';
import archiver from 'archiver';
import pLimit from 'p-limit';
import type { Readable } from 'stream';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
import { ComprobantesService } from './comprobantes.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import type { CreateComprobanteDto } from './dto/create-comprobante.dto';
import { CreateComprobanteSchema } from './dto/create-comprobante.dto';
import type { UploadFileDto } from './dto/upload-file.dto';
import { UploadFileSchema } from './dto/upload-file.dto';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/comprobantes')
@UseGuards(AuthGuard)
export class ComprobantesController {
  constructor(
    private readonly comprobantesService: ComprobantesService,
    private readonly driveService: GoogleDriveService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(CreateComprobanteSchema)) createComprobanteDto: CreateComprobanteDto,
  ) {
    return this.comprobantesService.create(user.id, createComprobanteDto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.comprobantesService.findAll(user.id, user.role, {
      page: Math.max(parseInt(page ?? '1', 10) || 1, 1),
      limit: Math.min(Math.max(parseInt(limit ?? '30', 10) || 30, 1), 100),
      search,
    });
  }

  @Get('download-range')
  async downloadRange(
    @CurrentUser() user: any,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('tipos') tipos: string,
    @Query('ruc') ruc: string | undefined,
    @Res() res: any,
  ) {
    const selectedTypes = tipos ? tipos.split(',') : ['factura', 'xml', 'guia', 'ordenCompra'];
    const comprobantes = await this.comprobantesService.findByDateRange(user.id, user.role, from, to, selectedTypes, ruc);

    const allFiles: { folder: string; fileId: string; fileName: string }[] = [];
    for (const c of comprobantes) {
      const folder = `${c.numeroSerie}-${c.numero}`;
      if (selectedTypes.includes('factura') && c.facturaFileId) allFiles.push({ folder, fileId: c.facturaFileId, fileName: c.facturaFileName! });
      if (selectedTypes.includes('xml') && c.xmlFileId) allFiles.push({ folder, fileId: c.xmlFileId, fileName: c.xmlFileName! });
      if (selectedTypes.includes('guia') && c.guiaFileId) allFiles.push({ folder, fileId: c.guiaFileId, fileName: c.guiaFileName! });
      if (selectedTypes.includes('ordenCompra') && c.ordenCompraFileId) allFiles.push({ folder, fileId: c.ordenCompraFileId, fileName: c.ordenCompraFileName! });
    }

    if (allFiles.length === 0) {
      res.status(404).json({ message: 'No hay archivos en ese rango de fechas' });
      return;
    }

    res.socket.setTimeout(0);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="comprobantes-${from}-a-${to}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 1 } });
    archive.on('error', (err) => { res.destroy(err); });
    archive.pipe(res);

    const errores: string[] = [];
    const limit = pLimit(3);
    await Promise.allSettled(
      allFiles.map((file) =>
        limit(async () => {
          try {
            const stream = await this.driveService.downloadStream(file.fileId);
            const buffer = await streamToBuffer(stream as any);
            archive.append(buffer, { name: `${file.folder}/${file.fileName}` });
          } catch (err: any) {
            const msg = `[ERROR] ${file.folder}/${file.fileName} — ${err?.message ?? err}`;
            errores.push(msg);
            console.error(msg);
          }
        }),
      ),
    );

    if (errores.length > 0) {
      archive.append(errores.join('\n'), { name: '_errores.txt' });
    }

    archive.finalize();
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.comprobantesService.findOne(user.id, user.role, id);
  }

  @Post(':id/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: tmpdir(),
      filename: (_req, file, cb) => {
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${extname(file.originalname)}`);
      },
    }),
  }))
  async uploadFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UploadFileSchema)) uploadFileDto: UploadFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      const driveFile = await this.driveService.uploadFile(file, user.id);

      return this.comprobantesService.updateFileInfo(
        user.id,
        user.role,
        id,
        uploadFileDto.tipoArchivo,
        driveFile.id,
        file.originalname,
      );
    } finally {
      unlink(file.path).catch(() => {});
    }
  }

  @Put(':id/revalidar')
  async revalidate(@CurrentUser() user: any, @Param('id') id: string) {
    return this.comprobantesService.revalidate(user.id, user.role, id);
  }

  @Get(':id/download/:tipo')
  async downloadFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Param('tipo') tipo: string,
    @Res() res: any,
  ) {
    const comprobante = await this.comprobantesService.findOne(user.id, user.role, id);

    const fileIdMap: Record<string, string | null> = {
      factura: comprobante.facturaFileId,
      xml: comprobante.xmlFileId,
      guia: comprobante.guiaFileId,
      ordenCompra: comprobante.ordenCompraFileId,
    };

    const fileId = fileIdMap[tipo];
    if (!fileId) {
      res.status(404).json({ message: 'Archivo no encontrado' });
      return;
    }

    const { stream, mimeType, name } = await this.driveService.downloadFileStream(fileId);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${name}"`,
    });
    stream.pipe(res);
  }

  @Get(':id/download-all')
  async downloadAllFiles(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: any,
  ) {
    const comprobante = await this.comprobantesService.findOne(user.id, user.role, id);

    const files = [
      { tipo: 'factura', fileId: comprobante.facturaFileId },
      { tipo: 'xml', fileId: comprobante.xmlFileId },
      { tipo: 'guia', fileId: comprobante.guiaFileId },
      { tipo: 'ordenCompra', fileId: comprobante.ordenCompraFileId },
    ].filter((f): f is { tipo: string; fileId: string } => !!f.fileId);

    if (files.length === 0) {
      res.status(404).json({ message: 'No hay archivos disponibles' });
      return;
    }

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="comprobante-${comprobante.codigoAlfanumerico}.zip"`,
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => { res.destroy(err); });
    archive.pipe(res);

    const limit = pLimit(3);
    await Promise.allSettled(
      files.map((file) =>
        limit(async () => {
          const { stream, name } = await this.driveService.downloadFileStream(file.fileId);
          archive.append(stream, { name });
        }),
      ),
    );

    archive.finalize();
  }
}
