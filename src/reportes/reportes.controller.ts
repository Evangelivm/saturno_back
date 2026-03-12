import { Controller, Get, Query, Res, UseGuards, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { ReportesService } from './reportes.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/reportes')
@UseGuards(AuthGuard)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('empresas')
  async buscarEmpresas(
    @CurrentUser() user: any,
    @Query('q') q: string = '',
  ) {
    if (user.role !== 'ADMIN') return [];
    return this.reportesService.searchEmpresas(q.trim());
  }

  @Get('legacy')
  async legacyReport(
    @CurrentUser() user: any,
    @Query('ruc') ruc: string,
    @Query('desde') desde?: string,
    @Query('hasta') hasta?: string,
    @Res() res?: Response,
  ) {
    if (user.role !== 'ADMIN') {
      res!.status(403).json({ message: 'Sin permisos' });
      return;
    }

    const { buffer, filename } = await this.reportesService.generateLegacyReport(ruc, desde, hasta);

    res!.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res!.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    res!.send(buffer);
  }

  @Get('legacy-batch')
  async legacyBatch(
    @CurrentUser() user: any,
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('tipos') tipos: string,
    @Query('ruc') ruc?: string,
    @Res() res?: Response,
  ) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const tiposArr = tipos ? tipos.split(',') : ['factura', 'xml', 'guia', 'pedido'];
    await this.reportesService.legacyBatch(res!, desde, hasta, tiposArr, ruc);
  }
}
